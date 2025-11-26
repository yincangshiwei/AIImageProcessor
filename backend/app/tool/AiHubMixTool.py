import mimetypes
import tempfile
import sys
import time
import traceback

from openai import OpenAI
from google import genai
from google.genai import types
import io
import os
from pathlib import Path
import base64
from PIL import Image
from PIL import ImageOps
from urllib.parse import urlparse
import requests
from PIL import Image

from backend.app.SuccessObj import SuccessObj
from TenCentCloudTool import TenCentCloudTool
from DateTool import DateTool
from LogTool import LogTool
from ProjectResourceTool import ProjectResourceTool

ai_models_config={
    "chat":{
        "gpt5":{
            "search":True,
            "searchType":"modelSearch"
        }
    },
    "gemini":{
        "gemini-2.5-flash-image":{
            "model_platform":"genai",
        },
        "gemini-2.5-flash-image-preview":{
            "model_platform":"genai",
        },
        "gemini-3-pro-image-preview":{
            "model_platform":"genai",
        }
    },
    "imagen":{
        "imagen-4.0-ultra-generate-001":{
            "model_platform":"genai",
            "model_path":"google/imagen-4.0-fast-generate-001"
        },
        "imagen-4.0-generate-001":{
            "model_platform":"genai",
            "model_path":"google/imagen-4.0-generate-001"
        },
        "imagen-4.0-fast-generate-001":{
            "model_platform":"genai",
            "model_path":"google/imagen-4.0-fast-generate-001"
        }
    },
    "video":{
        "sora-2":{
            "model_platform":"openai",
            "gen_type": ["single_image"],
            "size_choices":["720x1280", "1280x720"]
        },
        "sora-2-pro":{
            "model_platform":"openai",
            "gen_type": ["single_image"],
            "size_choices":["720x1280", "1280x720"]
        },
        "veo-3.1-generate-preview":{
            "model_platform":"genai",
            "gen_type": ["single_image","fl_image","multiple_image"]
        }
    }
}


def is_file_object(value):
    """判断是否为包含 name/type/body 的 File 对象（支持 dict 或对象）"""
    if isinstance(value, dict):
        return all(k in value for k in ("name", "type", "body"))
    else:
        # 如果是对象（如自定义类或 UploadFile），检查属性是否存在
        return all(hasattr(value, attr) for attr in ("name", "type", "body"))

def is_url(path_or_url):
    return isinstance(path_or_url, str) and path_or_url.startswith(('http://', 'https://'))

def get_file_name_and_ext(image):
    if is_file_object(image):
        full_name = getattr(image, 'name', '')
        if full_name:
            file_name = os.path.basename(full_name)
            file_ext = os.path.splitext(file_name)[1]
        else:
            file_ext = '.tmp'
            file_name = 'tmp' + file_ext
    else:
        # 本地路径
        file_name = os.path.basename(image)
        file_ext = os.path.splitext(file_name)[1]
        if not file_ext:
            file_ext = '.tmp'
            file_name += file_ext
    return file_name, file_ext

def guess_fmt_from_filename(fn):
    fn = fn.lower()
    if fn.endswith('.jpeg') or fn.endswith('.jpg'):
        return '.jpg', 'JPEG', 'image/jpeg'
    elif fn.endswith('.png'):
        return '.png', 'PNG', 'image/png'
    elif fn.endswith('.webp'):
        return '.webp', 'WEBP', 'image/webp'
    else:
        # 默认用PNG
        return '.png', 'PNG', 'image/png'

def choose_best_size_for_image(image: Image.Image, size_list):
    """
    image: PIL.Image
    size_list: list of str, e.g. ["720x1280", "1280x720"]
    return: 选中的尺寸字符串, 及其 (w, h)
    """
    img_w, img_h = image.size
    img_ratio = img_w / img_h

    def parse_size(size_str):
        w, h = map(int, size_str.lower().split('x'))
        return w, h

    min_diff = None
    best_size_str = None
    best_wh = None

    for size_str in size_list:
        w, h = parse_size(size_str)
        r = w / h
        diff = abs(img_ratio - r)
        if min_diff is None or diff < min_diff:
            min_diff = diff
            best_size_str = size_str
            best_wh = (w, h)
    return best_size_str, best_wh

def fetch_image_as_types_image(url: str) -> types.Image:
    # 下载图片为 bytes，并尽量确定 mime_type
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    ct = r.headers.get("content-type")
    if not ct or not ct.startswith("image/"):
        # 退化策略：通过扩展名猜测
        guess = mimetypes.guess_type(url)[0]
        ct = guess if guess and guess.startswith("image/") else "image/png"
    return types.Image(image_bytes=r.content, mime_type=ct)


class AiHubMixTool:
    logPath = None
    headers = {
        "Content-Type": "application/json; charset=UTF-8"
    }

    def __init__(self, log=LogTool(path=str(Path(__file__))[str(Path(__file__)).find('app'):len(str(Path(__file__)))].replace('.py', '') + '/')):
        self.log = log
        self.client = None
        self.base_url = None
        self.gemini_base_url = None
        self.api_key = None
        self.projectResourceTool = None
        self.tenCentCloudClient = None
        self.session = None
        self.dateTool = DateTool()


    def init(self, key_name):
        log = self.log
        log.debug('初始化AiHubMixTool')
        self.session = self.session if self.session else requests.Session()
        if not self.projectResourceTool:
            log.debug('没有发现projectResourceTool缓存实例，进行缓存初始化实例')
            self.projectResourceTool = ProjectResourceTool(log=log)
        else:
            log.debug('发现projectResourceTool缓存实例，使用缓存实例')
        # apollo配置参数
        param = "conf/apikey.json"
        jsonData = self.projectResourceTool.get(param)
        log.info(jsonData)
        self.api_key = jsonData["AiHubMix"]["keys"][key_name]["value"]
        self.base_url = jsonData["AiHubMix"]["base_url"]
        self.gemini_base_url = jsonData["AiHubMix"]["gemini_base_url"]
        return self

    def init_client(self, api_key=None, base_url=None, type="openai"):
        self.log.debug('进入OpenAITool.init_client')
        self.tenCentCloudClient = TenCentCloudTool().init("1325210923").buildClient("ap-guangzhou")
        if type == 'openai':
            self.log.debug('openAI调用')
            client = OpenAI(
                api_key=api_key if api_key else self.api_key,
                base_url=base_url if base_url else self.base_url
            )
        elif type == 'genai':
            self.log.debug('genai调用')
            client = genai.Client(
                api_key=api_key if api_key else self.api_key,
                http_options={"base_url": base_url if base_url else self.gemini_base_url},
            )
        else:
            return None
        self.client = client
        return self

    def _resolve_image_urls(self, image_urls):
        """
        将传入的 image_urls（可为字符串或列表）统一转换为可用的字符串列表：
        - 远程 URL（http/https/data）原样返回；
        - 本地路径读取为 base64 并转为 data:image/jpeg;base64,{...}。
        出错项记录日志并跳过。
        """
        if not image_urls:
            return []
        if isinstance(image_urls, str):
            image_urls = [image_urls]
        resolved = []
        for item in image_urls:
            try:
                if isinstance(item, str) and (item.startswith("http://") or item.startswith("https://") or item.startswith("data:")):
                    resolved.append(item)
                else:
                    with open(item, "rb") as f:
                        base64_image = base64.b64encode(f.read()).decode("utf-8")
                    resolved.append(f"data:image/jpeg;base64,{base64_image}")
            except Exception as e:
                self.log.error(f"处理图片失败: {item}, {e}")
        return resolved

    def chat(self, model, search_type=None, system_user_role_prompt=None, user_prompt='', images=None, user_history=None, **kwargs):
        self.log.debug('进入OpenAITool.text')
        sObj = SuccessObj()
        sObj.success = False

        try:
            if 'OCR' in model and images:
                images = self.process_files(images)

            if 'gpt' in model and 'search' not in model and search_type == 'isModelSearch':
                self.log.debug("-------触发特殊条件判断-------")
                self.log.debug("该为gpt系列非search模型内置搜索")
                input = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": user_prompt}
                        ]
                    }
                ]
                if system_user_role_prompt:
                    self.log.debug("发现系统用户设定")
                    input.insert(0, {"role":"system","content":[{"type":"input_text","text":system_user_role_prompt}]})
                for message in input:
                    if message["role"] == "user" and images:
                        for item in self._resolve_image_urls(images):
                            message["content"].append({"type": "input_image", "image_url": item})
                response = self.client.responses.create(
                    model=model,
                    tools=[{ "type": "web_search_preview" }],
                    input=input
                )
                self.log.debug(response.status)
                self.log.info(response)
                if response.status == 'completed':
                    if search_type:
                        if search_type == 'isModelSearch':
                            self.log.debug('模型搜索模式')
                            sObj.data = response.output[-1].content[0].text
                            sObj.success = True
                        else:
                            sObj.data = '无效search_type值'
                            return sObj.dic()
                    else:
                        self.log.debug('基础模式')
                        sObj.success = True
                        sObj.data = response.output[0].content[0].text
                else:
                    sObj.data = f'响应失败，失败状态为{response.status}'
            else:
                self.log.debug("-------正常逻辑-------")
                params = {
                    "model": model,
                    "messages": [{
                        "role": "user"
                    }],
                }
                if user_prompt:
                    params['messages'][0]['content'] = [{"type": "text", "text": user_prompt}]
                if system_user_role_prompt:
                    self.log.debug("发现系统用户设定")
                    params['messages'].insert(0, {"role":"system","content":[{"type":"text","text":system_user_role_prompt}]})
                if search_type:
                    if search_type == 'isModelSearch':
                        self.log.debug('模型搜索模式')
                        params["web_search_options"] = {}
                    else:
                        sObj.success = False
                        sObj.data = '无效search_type值'
                        return sObj.dic()
                if images:
                    for item in self._resolve_image_urls(images):
                        if 'content' in params['messages']:
                            params['messages'][0]["content"].append({
                                "type": "image_url",
                                "image_url": {"url": item}
                            })
                        else:
                            params['messages'][0]['content'] = [{"type": "image_url","image_url": {"url": item}}]
                self.log.debug('请求参数：')
                self.log.info(params)
                response = self.client.chat.completions.create(**params)
                sObj.success = True
                sObj.data = response.choices[0].message.content
        except Exception as e:
            tb = traceback.format_exc()
            # 可以把tb记录日志
            print(tb)  # 这里是举例，你可以写到日志
            sObj.data = str(e)
        return sObj.dic()

    def image(self, model,user_prompt, images=[], image_name=None, user_history=None, gen_ratio=None,gen_number=1, reqParam=None, **kwargs):
        self.log.debug('进入OpenAITool.image')
        sObj = SuccessObj()
        sObj.success = False
        result_images = []
        try:
            if model in ai_models_config['gemini']:
                self.log.debug('正在执行：gemini image图片生成')
                config = types.GenerateContentConfig(
                    image_config=types.ImageConfig(
                        aspect_ratio=gen_ratio,
                    )
                )
                contents = [user_prompt]
                for image in images:
                    imageO = self.load_image(image)
                    contents.append(imageO)
                self.log.debug('最终contents：')
                self.log.info(contents)
                for i in range(gen_number):
                    response = self.client.models.generate_content(
                        model=model,
                        contents=contents,
                        config=config if gen_ratio else None
                    )
                    for part in response.candidates[0].content.parts:
                        if part.text is not None:
                            self.log.info(part.text)
                            sObj.data = part.text
                        elif part.inline_data is not None:
                            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                                tmp_file.write(part.inline_data.data)
                                tmp_path = tmp_file.name
                            self.log.info(tmp_path)  # 现在你有了文件路径
                            image_name = image_name if image_name else get_file_name_and_ext(tmp_path)[0]
                            sObj.success = True
                            data = self.tenCentCloudClient.upload_file(bucket="yh-server-1325210923", file=tmp_path, fileName=f'AiHubMix/image/{self.dateTool.getDateStr("%Y-%m-%d")}/{image_name}')
                            if data['success']:
                                sObj.data = data['data']['Location']
                                result_images.append(data['data']['Location'])
                            os.remove(tmp_path)
                sObj.data = result_images
            elif model in ai_models_config['imagen']:
                self.log.debug('正在执行：imagen图片生成')
                response = self.client.models.generate_images(
                    model=model,
                    prompt=user_prompt,
                    config=types.GenerateImagesConfig(
                        number_of_images=gen_number,
                        aspectRatio=gen_ratio,
                        image_size= kwargs['imageSize'] if 'imageSize' in kwargs and kwargs['imageSize'] else "1K"
                    )
                )
                self.log.info(response)
                if response.generated_images:
                    for generated_image in response.generated_images:
                        # 假设 generated_image 是你的对象
                        image_bytes = generated_image.image.image_bytes
                        mime_type = generated_image.image.mime_type  # e.g. 'image/png'
                        # 决定文件扩展名
                        ext = 'png' if mime_type == 'image/png' else 'jpg'  # 可根据需要扩展支持
                        # 创建临时文件
                        with tempfile.NamedTemporaryFile(suffix=f'.{ext}', delete=False) as tmp_file:
                            tmp_file.write(image_bytes)
                            tmp_path = tmp_file.name  # 保存临时文件路径
                        self.log.info(tmp_path)  # 现在你有了文件路径
                        image_name = image_name if image_name else get_file_name_and_ext(tmp_path)[0]
                        sObj.success = True
                        data = self.tenCentCloudClient.upload_file(bucket="yh-server-1325210923", file=tmp_path,fileName=f'AiHubMix/image/{self.dateTool.getDateStr("%Y-%m-%d")}/{image_name}')
                        if data['success']:
                            result_images.append(data['data']['Location'])
                        os.remove(tmp_path)
                    sObj.data = result_images
                    sObj.success = True
                else:
                    sObj.data = "无效图片，请检查提示词规范或尝试再次生成！"
            else:
                param = {
                    "prompt": user_prompt
                }
                param.update(reqParam)
                result = self.req(model,param)
                sObj.success = result['success']
                sObj.data = result['data']
                self.log.debug('开始执行：统一智能绘图图片生成')
        except Exception as e:
            tb = traceback.format_exc()
            # 可以把tb记录日志
            print(tb)  # 这里是举例，你可以写到日志
            sObj.data = str(e)
        return sObj.dic()

    def video(self, model, user_prompt="Generate video", negative_prompt = None, size=None,images=[], gen_type=None, **kwargs):
        self.log.debug('进入OpenAITool.video')
        self.log.info(f"扩展参数值：{kwargs}")
        sObj = SuccessObj()
        sObj.success = False
        try:
            if model in ai_models_config['video']:
                if ai_models_config['video'][model]['model_platform'] == "openai":
                    self.log.debug('执行OpenAI视频接口')
                    if gen_type == "single_image":
                        if size is None:
                            self.log.debug('发现空size，计算图像size')
                            image = self.load_image(images[0])
                            # 2. 选最合适输出尺寸
                            size, (w, h) = choose_best_size_for_image(image, ai_models_config['video'][model]['size_choices'])
                            self.log.info(f"得到最佳size:{size}")
                            image = self.load_image(images[0], resize_to=(w, h), as_bytes=True)
                        else:

                            image = self.load_image(images[0], as_bytes=True)
                        video = self.client.videos.create(
                            model=model,
                            prompt=user_prompt,
                            input_reference=image,
                            size=size
                        )
                        progress = getattr(video, "progress", 0)
                        bar_length = 30
                        while video.status in ("in_progress", "queued"):
                            self.log.debug('循环获取视频')
                            # Refresh status
                            video = self.client.videos.retrieve(video.id)
                            self.log.info(f"视频结果状态：{video.status}")
                            progress = getattr(video, "progress", 0)

                            filled_length = int((progress / 100) * bar_length)
                            bar = "=" * filled_length + "-" * (bar_length - filled_length)
                            status_text = "Queued" if video.status == "queued" else "Processing"
                            sys.stdout.write(f"{status_text}: [{bar}]{progress: .1f} % ")
                            sys.stdout.flush()
                            # 重点：状态如果已经不是 in_progress/queued 了，不要 sleep 了!
                            if video.status not in ("in_progress", "queued"):
                                self.log.debug("成功获取视频，退出循环！")
                                time.sleep(5)
                                break  # 直接退出循环
                            time.sleep(60)
                        if video.status == "failed":
                            message = getattr(
                                getattr(video, "error", None), "message", "Video generation failed"
                            )
                            self.log.error(message)
                            sObj.data = message
                        else:
                            self.log.debug("Downloading video content...")
                            content = self.client.videos.download_content(video.id, variant="video")
                            self.log.info(content)
                            content.write_to_file(f"{video.id}.mp4")
                            self.log.debug(f"Wrote {video.id}.mp4")
                            data = self.tenCentCloudClient.upload_file(bucket="yh-server-1325210923", file=f"{video.id}.mp4", fileName=f'AiHubMix/video/{self.dateTool.getDateStr("%Y-%m-%d")}/{video.id}.mp4')
                            if data['success']:
                                sObj.data = data['data']['Location']
                            os.remove(f"{video.id}.mp4")
                            sObj.success = True
                elif ai_models_config['video'][model]['model_platform'] == "genai":
                    self.log.debug('执行Google Genai视频接口')
                    param = {}
                    if images:
                        if gen_type == 'single_image':
                            self.log.debug("单图模式")
                            operation = self.client.models.generate_videos(
                                model=model,
                                prompt=user_prompt,
                                image=fetch_image_as_types_image(images[0]),
                                config=types.GenerateVideosConfig(
                                    number_of_videos=1,
                                    aspect_ratio=kwargs['aspectRatio'] if 'aspectRatio' in kwargs and kwargs['aspectRatio'] else "16:9",
                                    resolution = kwargs['resolution'] if 'resolution' in kwargs and kwargs['resolution'] else "720p",
                                    duration_seconds = kwargs['durationSeconds'] if 'durationSeconds' in kwargs and kwargs['durationSeconds'] else "6",
                                    negative_prompt = negative_prompt if negative_prompt else None,
                                    person_generation="allow_adult"
                                )
                            )
                        elif gen_type == 'fl_image':
                            self.log.debug("首尾帧模式")
                            operation = self.client.models.generate_videos(
                                model="veo-3.1-generate-preview",
                                prompt=user_prompt,
                                image=fetch_image_as_types_image(images[0]),
                                config=types.GenerateVideosConfig(
                                    number_of_videos=1,
                                    last_frame=fetch_image_as_types_image(images[1]),
                                    aspect_ratio = kwargs['aspectRatio'] if 'aspectRatio' in kwargs and kwargs['aspectRatio'] else "16:9",
                                    resolution = kwargs['resolution'] if 'resolution' in kwargs and kwargs['resolution'] else "720p",
                                    duration_seconds=kwargs['durationSeconds'] if 'durationSeconds' in kwargs and kwargs['durationSeconds'] else "6",
                                    negative_prompt = negative_prompt if negative_prompt else None,
                                    person_generation="allow_adult"
                                ),
                            )
                        else:
                            self.log.debug("多图模式")
                            converted_images = [fetch_image_as_types_image(img) for img in images]
                            reference_images = [types.VideoGenerationReferenceImage(image=img,reference_type="asset")for img in converted_images]
                            self.log.info(f"reference_images：{reference_images}")
                            operation = self.client.models.generate_videos(
                                model=model,
                                prompt=user_prompt,
                                config=types.GenerateVideosConfig(
                                    reference_images=reference_images,
                                    number_of_videos=1,
                                    aspect_ratio=kwargs['aspectRatio'] if 'aspectRatio' in  kwargs and kwargs['aspectRatio'] else "16:9",
                                    resolution = kwargs['resolution'] if 'resolution' in kwargs and kwargs['resolution'] else "720p",
                                    duration_seconds=kwargs['durationSeconds'] if 'durationSeconds' in kwargs and kwargs['durationSeconds'] else "6",
                                    negative_prompt = negative_prompt if negative_prompt else None,
                                    person_generation="allow_adult"
                                ),
                            )
                    else:
                        self.log.debug('文本模式')
                        operation = self.client.models.generate_videos(
                            model=model,
                            prompt=user_prompt,
                            config=types.GenerateVideosConfig(
                                number_of_videos=1,
                                aspect_ratio=kwargs['aspectRatio'] if 'aspectRatio' in  kwargs and kwargs['aspectRatio'] else "16:9",
                                resolution = kwargs['resolution'] if 'resolution' in kwargs and kwargs['resolution'] else "720p",
                                duration_seconds=kwargs['durationSeconds'] if 'durationSeconds' in kwargs and kwargs['durationSeconds'] else "6",
                                negative_prompt = negative_prompt if negative_prompt else None,
                                person_generation="allow_all"
                            ),
                        )
                    param['operationName'] = operation.name
                    video_id = last_value = operation.name.split('/')[-1]
                    result = self.req(model,param)
                    # 耗时 2-3 分钟，视频时长 5-8s
                    while not result['data'].get('done', False):
                        time.sleep(60)
                        result = self.req(model,param)
                    if 'error' in result['data']:
                        sObj.data = result['data']['error']
                    elif 'videos' in result['data']['response']:
                        b64_str = result['data']['response']['videos'][0]['bytesBase64Encoded']
                        data = self.tenCentCloudClient.upload_file(bucket="yh-server-1325210923", file=b64_str,fileName=f'AiHubMix/video/{self.dateTool.getDateStr("%Y-%m-%d")}/{video_id}.mp4')
                        if data['success']:
                            sObj.data = data['data']['Location']
                        sObj.success = True
                    elif 'raiMediaFilteredReasons' in result['data']['response']:
                        sObj.data = result['data']['response']['raiMediaFilteredReasons'][0]
                    else:
                        sObj.data = f"未知错误：{result['data']}"
                else:
                    sObj.data = '未支持的平台'
            else:
                sObj.data='无效model'
        except Exception as e:
            tb = traceback.format_exc()
            # 可以把tb记录日志
            print(tb)  # 这里是举例，你可以写到日志
            sObj.data = str(e)
        return sObj.dic()

    def req(self, model, param):
        """
           请求轩辕API接口：先初始化LingXingAPITool.init再执行该方法
           :param name: 请求地址名称
           :param type: 类型（lingxing.json的url）
           :param param:请求参数
           :return:
        """
        log = self.log
        log.debug('开始执行：AiHubMixTool.req（请求）')
        session = self.session
        sObj = SuccessObj()
        sObj.success = False
        try:
            log.info(f'请求参数:{param}')
            if model in ai_models_config['video'] and ai_models_config['video'][model]['model_platform'] == 'genai':
                reqData = session.get(f"https://aihubmix.com/gemini/v1beta/{param['operationName']}?key={self.api_key}").json()
                log.debug('----请求结果----')
                log.info(reqData)
                sObj.success = True
                sObj.data = reqData
            else:
                sObj.data = f"无效{model}，暂不支持该model。"
            return sObj.dic()
        except Exception as e:
            raise e

    def load_image(self, image_input, as_bytes=False, filename=None, mime_type=None, resize_to=None):
        image = None
        input_type = type(image_input).__name__

        # --- 1. 处理str类型 ---
        if isinstance(image_input, str):
            parsed_url = urlparse(image_input)
            if all([parsed_url.scheme, parsed_url.netloc]):
                try:
                    response = requests.get(image_input, stream=True)
                    response.raise_for_status()
                    image_data = io.BytesIO(response.content)
                    image = Image.open(image_data)
                except Exception as e:
                    raise ValueError(f"URL图片处理失败: {e}")
                # 用URL basename做默认filename
                basename = os.path.basename(parsed_url.path)
            else:
                if not os.path.exists(image_input):
                    raise ValueError(f"本地文件不存在: {image_input}")
                try:
                    image = Image.open(image_input)
                except Exception as e:
                    raise ValueError(f"本地图片处理失败: {e}")
                basename = os.path.basename(image_input)
            # 识别文件名和后缀
            if filename is None:
                filename = basename if basename else 'image.png'
            ext, fmt, mt = guess_fmt_from_filename(filename)
            if not filename.lower().endswith(ext):
                filename += ext
            if mime_type is None:
                mime_type = mt

        # --- 2. 处理{name, type, body}自定义File对象 ---
        elif is_file_object(image_input):
            try:
                body = getattr(image_input, 'body', None) or image_input.get('body')
                if body is None:
                    raise ValueError("File对象或dict中未找到'body'")
                image_data = io.BytesIO(body)
                image = Image.open(image_data)
            except Exception as e:
                raise ValueError(f"File对象处理失败: {e}")
            # 文件名和类型自dict或对象属性推断
            if filename is None:
                filename = getattr(image_input, 'name', None) or image_input.get('name') or 'image.png'
            ext, fmt, mt = guess_fmt_from_filename(filename)
            if not filename.lower().endswith(ext):
                filename += ext
            if mime_type is None:
                mime_type = mt

        # --- 3. 不支持的类型 ---
        else:
            raise TypeError(
                f"不支持类型: {input_type}. 请输入URL、本地路径或{{name,type,body}}的对象。"
            )

        if image is None:
            raise ValueError("图片未成功加载，原因不明。")
        # --- 自动resize到指定尺寸 ---
        if resize_to:
            self.log.debug('压缩图像尺寸')
            tw, th = resize_to
            image = ImageOps.fit(image, (tw, th), Image.LANCZOS, centering=(0.5, 0.5))
            self.log.info(f"缩放后尺寸:{image.size}")
        # --- as_bytes流程 ---
        if as_bytes:
            out = io.BytesIO()
            fmt = "PNG"
            if filename and filename.lower().endswith('.jpg'):
                fmt = "JPEG"
            elif filename and filename.lower().endswith('.webp'):
                fmt = "WEBP"
            image.save(out, format=fmt)
            out.seek(0)
            return (filename or "image.png", out, mime_type or "image/png")

        return image

    def process_files(self, images):
        self.log.debug('转化文件')
        new_images = []
        for image in images:
            if is_url(image):
                new_images.append(image)
            elif is_file_object(image):
                # 得到原文件扩展名，如果没有后缀，默认用".tmp"
                file_name, file_ext = get_file_name_and_ext(image)
                with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as tmp_file:
                    image.seek(0)
                    tmp_file.write(image.read())
                    tmp_file.flush()
                    tmp_file_path = tmp_file.name
                    data = self.tenCentCloudClient.upload_file(bucket="yh-server-1325210923", file=tmp_file_path,fileName=f'temp/AiHubMix/{self.dateTool.getDateStr("%Y-%m-%d")}/{file_name}')
                    if data['success']:
                        url = data['data']['Location']
                        new_images.append(url)
                    os.remove(tmp_file_path)
            else:
                # 假设是本地路径
                file_name, file_ext = get_file_name_and_ext(image)
                with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as tmp_file:
                    with open(image, 'rb') as f:
                        tmp_file.write(f.read())
                    tmp_file.flush()
                    tmp_file_path = tmp_file.name
                    data = self.tenCentCloudClient.upload_file(bucket="yh-server-1325210923", file=tmp_file_path,fileName=f'temp/AiHubMix/{self.dateTool.getDateStr("%Y-%m-%d")}/{file_name}')
                    if data['success']:
                        url = data['data']['Location']
                        new_images.append(url)
                    os.remove(tmp_file_path)
        return new_images

if __name__ == '__main__':
    print('执行')
    # openai调用
    client = AiHubMixTool().init("int_serv").init_client(type='openai')
    # images = [
    #     r'C:\Users\yhadmin\Desktop\识别提取\lQLPJxYlo16HBqHNDJvNCzmwdhywhOsMm50IWMPP8d3wAA_2873_3227.png',
    # ]
    sObj = client.chat(model='gpt-4.1', user_prompt='你好')
    print(sObj['data'])

    # 视频生成
    # print(client.video("sora-2", user_prompt="镜头旋转"))

    # # genai调用
    # client = AiHubMixTool().init("int_serv").init_client(type='genai')
    # # 图片生成
    # prompt = (
    #     "Generate a sexy realistic Asian girl"
    # )
    # print(client.image('imagen-4.0-ultra-generate-001',user_prompt=prompt))
    # # 图片编辑
    # images = ['https://yh-server-1325210923.cos.ap-guangzhou.myqcloud.com/int_serv/%E7%B2%BE%E7%81%B5.png']
    # prompt = (
    #     "Add a cat"
    # )
    # print(client.image('gemini-3-pro-image-preview', user_prompt=prompt, images=images))

    # 统一图像生成
    # prompt = (
    #     "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"
    # )
    # reqParam = {
    #     "numberOfImages":1
    # }
    # print(client.image('imagen-4.0-generate-001',user_prompt=prompt,reqParam=reqParam))

    # 视频生成
    # client = AiHubMixTool().init("int_serv").init_client(type='genai')
    # # 文生视频
    # prompt = """一只猫走着模特步在街上行走"""
    # print(client.video("veo-3.1-generate-preview", user_prompt=prompt, durationSeconds=4))
    # # 单图生视频
    # # 首尾帧生视频
    # prompt = """旋转镜头"""
    # images = [
    #     'https://yh-server-1325210923.cos.ap-guangzhou.myqcloud.com/int_serv/%E8%A7%86%E9%A2%91%E6%B5%8B%E8%AF%95/VCG211360714170.jpg',
    #     'https://yh-server-1325210923.cos.ap-guangzhou.myqcloud.com/int_serv/%E8%A7%86%E9%A2%91%E6%B5%8B%E8%AF%95/VCG211360715749.jpg']
    # print(client.video("veo-3.1-generate-preview", user_prompt=prompt, durationSeconds=4, images=images,gen_type="single_image"))
    # # 首尾帧生视频
    # prompt = """切换镜头"""
    # images = [
    #     'https://yh-server-1325210923.cos.ap-guangzhou.myqcloud.com/int_serv/%E8%A7%86%E9%A2%91%E6%B5%8B%E8%AF%95/VCG211360714170.jpg',
    #     'https://yh-server-1325210923.cos.ap-guangzhou.myqcloud.com/int_serv/%E8%A7%86%E9%A2%91%E6%B5%8B%E8%AF%95/VCG211360715749.jpg']
    # print(client.video("veo-3.1-generate-preview", user_prompt=prompt, durationSeconds=4, images=images, gen_type="fl_image"))
    # # 多图生视频
    # prompt = """切换镜头"""
    # images = [
    #     'https://yh-server-1325210923.cos.ap-guangzhou.myqcloud.com/int_serv/%E8%A7%86%E9%A2%91%E6%B5%8B%E8%AF%95/VCG211360714170.jpg',
    #     'https://yh-server-1325210923.cos.ap-guangzhou.myqcloud.com/int_serv/%E8%A7%86%E9%A2%91%E6%B5%8B%E8%AF%95/VCG211360715749.jpg',
    #     'https://yh-server-1325210923.cos.ap-guangzhou.myqcloud.com/int_serv/%E8%A7%86%E9%A2%91%E6%B5%8B%E8%AF%95/VCG211360715911.jpg']
    # print(client.video("veo-3.1-generate-preview", user_prompt=prompt, durationSeconds=8, images=images))