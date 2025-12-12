# @Author : cxd
# @DateTime : 2020/9/16/0016 15:50
# @File : TenCentCloudTool.py
# @remark :腾讯云工具类
import hashlib, hmac, json, os, time,sys
from datetime import datetime
import orjson
import base64
import requests as req
import uuid
from pathlib import Path
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
# 导入 SMS 模块的client models
from tencentcloud.sms.v20190711 import sms_client, models
from tencentcloud.ocr.v20181119 import ocr_client, models
from qcloud_cos import CosConfig
from qcloud_cos import CosS3Client
from qcloud_cos import CosServiceError

from app.SuccessObj import SuccessObj
from urllib.parse import urlparse, unquote
# 导入可选配置类
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.common.profile.http_profile import HttpProfile

from app.tool.LogTool import LogTool
from app.tool.JsonTool import JsonTool
from app.tool.DateTool import DateTool
from app.tool.ProjectResourceTool import ProjectResourceTool

def is_base64(s):
    if not isinstance(s, str):
        return False
    # 简单判断，有 data:xxx;base64, 或疑似纯base64字符串(长度合适且无特殊字符)
    if ',' in s and 'base64' in s:
        b64part = s.split(',')[-1]
    else:
        b64part = s
    # Base64只由A-Za-z0-9+/=组成，且长度足够
    if len(b64part) < 16:
        return False
    try:
        base64.b64decode(b64part, validate=True)
        return True
    except Exception:
        return False


def is_file_object(value):
    """判断是否为包含 name/type/body 的 File 对象（支持 dict 或对象）"""
    if isinstance(value, dict):
        return all(k in value for k in ("name", "type", "body"))
    else:
        # 如果是对象（如自定义类或 UploadFile），检查属性是否存在
        return all(hasattr(value, attr) for attr in ("name", "type", "body"))

class TenCentCloudTool:
    jsonTool = JsonTool()

    def __init__(self, log=LogTool(path=str(Path(__file__))[str(Path(__file__)).find('app'):len(str(Path(__file__)))].replace('.py', '') + '/')):
        self.appId = None
        self.SecretId = None
        self.SecretKey = None
        self.sts_config = None
        self.dateTool = None
        self.log = log
        self.client = None
        self.bucket = None
        self.region = None
        self.session = req.Session()
        self.projectResourceTool = None

    def init(self, apiSecretNum):
        log = self.log
        log.debug('初始化TenCentCloudTool')
        self.dateTool = DateTool()
        self.session = self.session if self.session else req.Session()
        if not self.projectResourceTool:
            log.debug('没有发现projectResourceTool缓存实例，进行缓存初始化实例')
            self.projectResourceTool = ProjectResourceTool( log=log)
        else:
            log.debug('发现projectResourceTool缓存实例，使用缓存实例')
        # 本地文件
        param = "conf/tenCentCloud.json"
        jsonData = self.projectResourceTool.get(param)
        log.info(jsonData)
        apiSecret = jsonData["apiSecret"][str(apiSecretNum)]
        log.info(apiSecret)
        self.appId = apiSecretNum
        self.SecretId = apiSecret['SecretId']
        self.SecretKey = apiSecret['SecretKey']
        self.sts_config = jsonData['sts']['config']
        return self



    def sendMsg(self, Sign, ExtendCode, PhoneNumberSet, TemplateID, TemplateParamSet):
        """
        发送短信消息
        :param Sign: 签名
        :param SessionContext: 内容
        :param PhoneNumberSet: 联系号码（数组形式）
        :param TemplateID: 模板ID
        :param TemplateParamSet: 模板参数
        :return:
        """
        log = self.log
        log.debug('进入TenCentCloudTool.sendMsg')
        try:
            # 必要步骤：
            # 实例化一个认证对象，入参需要传入腾讯云账户密钥对 secretId 和 secretKey
            # 本示例采用从环境变量读取的方式，需要预先在环境变量中设置这两个值
            # 您也可以直接在代码中写入密钥对，但需谨防泄露，不要将代码复制、上传或者分享给他人
            # CAM 密钥查询：https://console.cloud.tencent.com/cam/capi

            cred = credential.Credential(self.SecretId, self.SecretKey)
            # cred = credential.Credential(
            #     os.environ.get(""),
            #     os.environ.get("")
            # )

            # 实例化一个 http 选项，可选，无特殊需求时可以跳过
            httpProfile = HttpProfile()
            httpProfile.reqMethod = "POST"  # POST 请求（默认为 POST 请求）
            httpProfile.reqTimeout = 30  # 请求超时时间，单位为秒（默认60秒）
            httpProfile.endpoint = "sms.tencentcloudapi.com"  # 指定接入地域域名（默认就近接入）

            # 非必要步骤:
            # 实例化一个客户端配置对象，可以指定超时时间等配置
            clientProfile = ClientProfile()
            clientProfile.signMethod = "TC3-HMAC-SHA256"  # 指定签名算法
            clientProfile.language = "en-US"
            clientProfile.httpProfile = httpProfile

            # 实例化 SMS 的 client 对象
            # 第二个参数是地域信息，可以直接填写字符串 ap-guangzhou，或者引用预设的常量
            client = sms_client.SmsClient(cred, "ap-guangzhou", clientProfile)

            # 实例化一个请求对象，根据调用的接口和实际情况，可以进一步设置请求参数
            # 您可以直接查询 SDK 源码确定 SendSmsRequest 有哪些属性可以设置
            # 属性可能是基本类型，也可能引用了另一个数据结构
            # 推荐使用 IDE 进行开发，可以方便的跳转查阅各个接口和数据结构的文档说明
            req = models.SendSmsRequest()

            # 基本类型的设置:
            # SDK 采用的是指针风格指定参数，即使对于基本类型也需要用指针来对参数赋值
            # SDK 提供对基本类型的指针引用封装函数
            # 帮助链接：
            # 短信控制台：https://console.cloud.tencent.com/smsv2
            # sms helper：https://cloud.tencent.com/document/product/382/3773

            # 短信应用 ID: 在 [短信控制台] 添加应用后生成的实际 SDKAppID，例如1400006666
            req.SmsSdkAppid = "1400428107"
            # 短信签名内容: 使用 UTF-8 编码，必须填写已审核通过的签名，可登录 [短信控制台] 查看签名信息
            req.Sign = Sign
            # 短信码号扩展号: 默认未开通，如需开通请联系 [sms helper]
            req.ExtendCode = ExtendCode
            # 用户的 session 内容: 可以携带用户侧 ID 等上下文信息，server 会原样返回
            req.SessionContext = ""
            # 国际/港澳台短信 senderid: 国内短信填空，默认未开通，如需开通请联系 [sms helper]
            req.SenderId = ""
            # 下发手机号码，采用 e.164 标准，+[国家或地区码][手机号]
            # 例如+8613711112222， 其中前面有一个+号 ，86为国家码，13711112222为手机号，最多不要超过200个手机号
            req.PhoneNumberSet = PhoneNumberSet
            # 模板 ID: 必须填写已审核通过的模板 ID，可登录 [短信控制台] 查看模板 ID
            req.TemplateID = TemplateID
            # 模板参数: 若无模板参数，则设置为空
            req.TemplateParamSet = TemplateParamSet
            log.debug('检查参数：')
            log.info(req)
            # 通过 client 对象调用 SendSms 方法发起请求。注意请求方法名与请求对象是对应的
            resp = client.SendSms(req)
            # 输出 JSON 格式的字符串回包
            return orjson.loads(resp.to_json_string(indent=2))
        except TencentCloudSDKException as err:
            raise err

    def buildClient(self, region, secret_id=None, secret_key=None, token=None, domain=None):
        # -*- coding=utf-8
        # appid 已在配置中移除,请在参数 Bucket 中带上 appid。Bucket 由 BucketName-APPID 组成
        # 1. 设置用户配置, 包括 secretId，secretKey 以及 Region
        domain = domain if domain else self.sts_config['domain']
        secret_id = secret_id if secret_id else self.SecretId   # 替换为用户的 secretId(登录访问管理控制台获取)
        secret_key = secret_key if secret_key else self.SecretKey  # 替换为用户的 secretKey(登录访问管理控制台获取)
        scheme = 'https'  # 指定使用 http/https 协议来访问 COS，默认为 https，可不填
        config = CosConfig(Region=region, Secret_id=secret_id, Secret_key=secret_key, Token=token)
        # 2. 获取客户端对象
        client = CosS3Client(config)
        self.region = region
        self.client = client
        return self

    def get_filename(self, source, source_type='url', response=None):
        log = self.log
        if source_type == 'localFile':
            log.debug('发现本地文件')
            # 直接从本地路径提取文件名
            filename = os.path.basename(source)
            log.info(f'提取到的文件名为：{filename}')
            return filename

        elif source_type == 'url':
            log.debug('发现url文件')
            log.debug('从header提取文件名')
            # 优先尝试从 response 的 Content-Disposition 获取
            if response is not None:
                cd = response.headers.get('Content-Disposition')
                if cd and 'filename=' in cd:
                    # 处理带引号或分号的情况
                    filename = cd.split('filename=')[-1].split(';')[0].strip().strip('"\'')
                    filename = unquote(filename)
                    if filename:
                        log.info(f'提取到的文件名为：{filename}')
                        return filename
            log.debug('从url路径提取文件名')
            # 回退：从 URL 路径提取
            parsed = urlparse(source)
            filename = os.path.basename(parsed.path)
            if not filename or '.' not in filename:
                log.debug('无法提取文件名，将使用默认downloaded_file.webp')
                filename = 'downloaded_file.webp'
            log.info(f'提取到的文件名为：{filename}')
            return filename

        else:
            raise ValueError("source_type 必须是 'url' 或 'localfile'")


    def upload_file(self, bucket, file, fileName=None, PartSize=1, MAXThread=10, EnableMD5=False):
        """
            分块上传服务：
            bucket: 桶位
            LocalFilePat 吗                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            h：本地图片地址
            fileName: 腾讯云 对象key
        """
        log = self.log
        log.debug('正在访问TenCentCloudTool.upload_file（文件上传）')
        client = self.client
        try:
            if is_file_object(file):
                log.debug("发现File对象")
                log.info(file)

                def _extract_attr(target, attr, default=None):
                    if isinstance(target, dict):
                        return target.get(attr, default)
                    return getattr(target, attr, default)

                raw_name = _extract_attr(file, 'name') or _extract_attr(file, 'filename')
                key = fileName if fileName else (raw_name or f'upload_{int(time.time())}')

                body_value = _extract_attr(file, 'body')
                if body_value is None and hasattr(file, 'file'):
                    body_value = getattr(file, 'file')

                if hasattr(body_value, 'read'):
                    body_value = body_value.read()

                if isinstance(body_value, str):
                    body_value = body_value.encode('utf-8')
                elif isinstance(body_value, bytearray):
                    body_value = bytes(body_value)

                if body_value is None:
                    return {"success": False, "data": "上传文件内容为空"}

                response = client.put_object(
                    Bucket=bucket,
                    Body=body_value,
                    Key=f'/AIImageProcessor/{key}',
                )
            elif isinstance(file, str) and is_base64(file):
                log.debug("发现base64编码内容")
                if ',' in file and 'base64' in file:
                    file_base64 = file.split(',')[-1]
                else:
                    file_base64 = file
                try:
                    body = base64.b64decode(file_base64, validate=True)
                except Exception as e:
                    log.error("base64解码失败: {}".format(str(e)))
                    return {"success": False, "data": "base64解码失败: " + str(e)}
                key = fileName if fileName else "upload_from_base64"
                response = client.put_object(
                    Bucket=bucket,
                    Body=body,
                    Key=f'/AIImageProcessor/{key}',
                )
            elif isinstance(file, str) and file.startswith(('http://', 'https://')):
                log.debug("发现url文件")
                res = req.get(file)
                key = fileName if fileName else self.get_filename(file, 'url', res)
                response = client.put_object(
                    Bucket=bucket,
                    Body=res,
                    Key=f'/AIImageProcessor/{key}',
                )
            else:
                log.debug('发现本地文件')
                key = fileName if fileName else self.get_filename(file, 'localFile')
                response = client.upload_file(
                    Bucket=bucket,
                    LocalFilePath=file,
                    Key=f'/AIImageProcessor/{key}',
                    PartSize=PartSize,
                    MAXThread=MAXThread,
                    EnableMD5=EnableMD5
                )
            log.debug(response)
            if 'Location' not in response:
                log.debug('没有发现Location,开始进行封装')
                response['Location'] = f"https://{bucket}.cos.{self.region}.myqcloud.com/AIImageProcessor/{key}"
            return {"success": True, "data": response}
        except CosServiceError as e:
            log.debug(f'失败了{e.get_status_code()}')
            return {"success": False, "data": f"上传文件失败：{e.get_status_code()}"}

    def delete_obj(self, bucket, key):
        """
            bucket: 桶位
            key: 对象路径，可目录可单个文件。（目录下存在文件的无法删除整个目录）
        """
        log = self.log
        client = self.client
        try:
            response = client.delete_object(
                Bucket=bucket,
                Key=key
            )
            log.debug(response)
            return {"success": True, "data": response}
        except CosServiceError as e:
            log.debug(f'失败了{e.get_status_code()}')
            return {"success": False, "data": f"删除文件失败：{e.get_status_code()}"}
    
    
    def gen_id_card_ocr(self, img_url):
        """
            腾讯云身份证识别
            img_url: 身份证图片地址
        """
        log = self.log
        log.debug('正在访问TenCentCloudTool.gen_id_card_ocr（身份证识别）')
        sObj = SuccessObj()
        sObj.success = False
        try:
            # 实例化一个认证对象，入参需要传入腾讯云账户 SecretId 和 SecretKey，此处还需注意密钥对的保密
            # 代码泄露可能会导致 SecretId 和 SecretKey 泄露，并威胁账号下所有资源的安全性。以下代码示例仅供参考，建议采用更安全的方式来使用密钥，请参见：https://cloud.tencent.com/document/product/1278/85305
            # 密钥可前往官网控制台 https://console.cloud.tencent.com/cam/capi 进行获取
            cred = credential.Credential(self.SecretId, self.SecretKey)
            # 实例化一个http选项，可选的，没有特殊需求可以跳过
            httpProfile = HttpProfile()
            httpProfile.endpoint = "ocr.tencentcloudapi.com"

            # 实例化一个client选项，可选的，没有特殊需求可以跳过
            clientProfile = ClientProfile()
            clientProfile.httpProfile = httpProfile
            # 实例化要请求产品的client对象,clientProfile是可选的
            client = ocr_client.OcrClient(cred, "ap-guangzhou", clientProfile)

            # 实例化一个请求对象,每个接口都会对应一个request对象
            req = models.IDCardOCRRequest()
            params = {
                "ImageUrl": img_url
            }
            req.from_json_string(json.dumps(params))

            # 返回的resp是一个IDCardOCRResponse的实例，与请求对象对应
            resp = client.IDCardOCR(req)
            # 输出json格式的字符串回包
            print(resp.to_json_string())
            sObj.success = True
            sObj.data = orjson.loads(resp.to_json_string())
        except TencentCloudSDKException as err:
            print(err)
            sObj.isException = True
            sObj.data = f'身份证验证失败-解析异常：{err}'
        return sObj
    
    def doc_to_html(self, json_param, weboffice_url=1):
        """
        文档转html
        :param json_param:
                docUrl：cos存储的文件原始方式地址
                copyable：是否允许复制（0=不允许，1=允许，默认0）
                htmlwaterword：水印文本，不填写则没有水印
                htmlfillstyle：水印RPGA（颜色和透明度）。默认：rgba(192,192,192,0.6)
                htmlfront：水印文字样式。默认：bold 20px Serif
                htmlrotate：旋转角度，0-360。默认：315
                htmlhorizontal：水印文本水平间距，单位px，默认：50
                htmlvertical：水印文本垂直间距，单位px，默认：100
        :return:
        """
        log = self.log
        sObj = SuccessObj()
        session = self.session
        sObj.success = False
        if "docUrl" not in json_param:
            raise Exception("HTTP 400: Bad Request (Missing argument docUrl)")
        docUrl = json_param['docUrl']
        log.info(f"请求地址：{{docUrl}}")
        del json_param['docUrl']
        json_param["ci-process"] = "doc-preview"
        json_param["dstType"] = "html"
        json_param["weboffice_url"] = weboffice_url
        if "copyable" not in json_param:
            json_param["copyable"] = 0
        if "htmlwaterword" in json_param and json_param["htmlwaterword"]:
            htmlwaterword = base64.b64encode(json_param["htmlwaterword"].encode("utf-8")).decode().replace("+", "-").replace("/", "_")
            json_param["htmlwaterword"] = htmlwaterword
        if "htmlfillstyle" in json_param and json_param["htmlfillstyle"]:
            htmlfillstyle = base64.b64encode(json_param["htmlfillstyle"].encode("utf-8")).decode().replace("+", "-").replace("/", "_")
            json_param["htmlfillstyle"] = htmlfillstyle
        if "htmlfront" in json_param and json_param["htmlfront"]:
            htmlfront = base64.b64encode(json_param["htmlfront"].encode("utf-8")).decode().replace("+", "-").replace("/", "_")
            json_param["htmlfront"] = htmlfront
        log.debug("请求参数：")
        log.info(json_param)
        res = session.get(docUrl, params=json_param)
        log.debug("请求结果：")
        res.encoding = 'utf-8'
        resp_content = res.text.replace("腾讯云-数据万象-", "").replace("数据万象", "DCHCloud,德诚行集团").replace("</title>", "</title><link rel=\"shortcut icon\" href=\"./docToHtml/favicon.ico\">")
        log.info(resp_content)
        if res.status_code == 200:
            if weboffice_url == 1:
                try:
                    sObj.data = res.json()["PreviewUrl"]
                    sObj.success = True
                except ValueError as e:
                    sObj.data = "数据解析失败，原因可能是请求参数不正确或其它原因！"
            else:
                sObj.success = True
                sObj.data = resp_content
        else:
            sObj.data = resp_content
        return sObj
    
    def cloud_base(self):
        log = self.log
        service = "tcb"
        version = "1.0"
        algorithm = "TC3-HMAC-SHA256"
        timestamp = int(time.time())
        date = datetime.utcfromtimestamp(timestamp).strftime("%Y-%m-%d")

        # ************* 步骤 1：拼接规范请求串 *************
        signed_headers = "content-type;host"
        canonical_request = "POST\n//api.tcloudbase.com/\n\ncontent-type:application/json; charset=utf-8\nhost:api.tcloudbase.com\n\ncontent-type;host\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

        # ************* 步骤 2：拼接待签名字符串 *************
        credential_scope = date + "/" + service + "/" + "tc3_request"
        hashed_canonical_request = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
        string_to_sign = (algorithm + "\n" +
                          str(timestamp) + "\n" +
                          credential_scope + "\n" +
                          hashed_canonical_request)
        print(string_to_sign)

        # ************* 步骤 3：计算签名 *************
        # 计算签名摘要函数
        def sign(key, msg):
            return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

        secret_date = sign(("TC3" + self.SecretKey).encode("utf-8"), date)
        secret_service = sign(secret_date, service)
        secret_signing = sign(secret_service, "tc3_request")
        signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
        print(signature)

        # ************* 步骤 4：拼接 Authorization *************
        authorization = (algorithm + " " +
                         "Credential=" + self.SecretId+ "/" + credential_scope + ", " +
                         "SignedHeaders=" + signed_headers + ", " +
                         "Signature=" + signature)
        print(authorization)
        return

    def hy_chat(self, messages):
        out = self.HunYuan().chat(self.appId, self.SecretId, self.SecretKey, messages)
        return out

    class HunYuan:
        _SIGN_HOST = "hunyuan.cloud.tencent.com"
        _SIGN_PATH = "hyllm/v1/chat/completions"
        _URL = "https://hunyuan.cloud.tencent.com/hyllm/v1/chat/completions"

        def chat(self, appid, secretid, secretkey, messages):
            request = self.gen_param(appid, messages, secretid, 0)
            print(request)
            signature = self.gen_signature(secretkey, self.gen_sign_params(request))
            # print(signature)
            headers = {
                "Content-Type": "application/json",
                "Authorization": str(signature)
            }
            print('Input:\n{} | {} | {}'.format(self._URL, headers, request))

            url = self._URL
            resp = req.post(url, headers=headers, json=request, stream=True)
            print('Output:')
            output_str = ""
            data_js = resp.json()
            if 'error' in data_js:
                print(data_js['error']['message'])
            else:
                output_str = data_js['choices'][0]['messages']['content']
                print(data_js['choices'][0]['messages']['content'], end='', flush=True)
            return output_str

        # def chat_stream(self, appid, secretid, secretkey, messages):
        #     request = self.gen_param(appid, messages, secretid, 1)
        #     signature = self.gen_signature(secretkey, self.gen_sign_params(request))
        #     # print(signature)
        #     headers = {
        #         "Content-Type": "application/json",
        #         "Authorization": str(signature)
        #     }
        #     print('Input:\n{} | {} | {}'.format(self._URL, headers, request))
        #     url = self._URL
        #     resp = req.post(url, headers=headers, json=request, stream=True)
        #     print('Output:')
        #     # 如果使用出错请注意sse版本是否正确, pip3 install sseclient-py==1.7.2
        #     client = sseclient.SSEClient(resp)
        #     output_str = ""
        #     for event in client.events():
        #         if event.data != '':
        #             data_js = json.loads(event.data)
        #             try:
        #                 if 'error' in data_js:
        #                     print(data_js['error']['message'])
        #                 if data_js['choices'][0]['finish_reason'] == 'stop':
        #                     break
        #                 print(data_js['choices'][0]['delta']['content'], end='', flush=True)
        #                 output_str += data_js['choices'][0]['delta']['content']
        #             except Exception as exception:
        #                 print(exception)
        #     return output_str

        def gen_param(self, appid, messages, secretid, stream):
            timestamp = int(time.time()) + 10000
            request = {
                "app_id": appid,
                "secret_id": secretid,
                "query_id": "test_query_id_" + str(uuid.uuid4()),
                "messages": messages,
                "temperature": 0.0,
                "top_p": 0.8,
                "stream": stream,
                "timestamp": timestamp,
                "expired": timestamp + 24 * 60 * 60
            }
            return request

        def gen_signature(self, secretkey, param):
            sort_dict = sorted(param.keys())
            sign_str = self._SIGN_HOST + "/" + self._SIGN_PATH + "?"
            for key in sort_dict:
                sign_str = sign_str + key + "=" + str(param[key]) + '&'
            sign_str = sign_str[:-1]
            print(sign_str)
            hmacstr = hmac.new(secretkey.encode('utf-8'),
                               sign_str.encode('utf-8'), hashlib.sha1).digest()
            signature = base64.b64encode(hmacstr)
            signature = signature.decode('utf-8')
            return signature

        def gen_sign_params(self, data):
            params = dict()
            params['app_id'] = data["app_id"]
            params['secret_id'] = data['secret_id']
            params['query_id'] = data['query_id']
            # float类型签名使用%g方式，浮点数字(根据值的大小采用%e或%f)
            params['temperature'] = '%g' % data['temperature']
            params['top_p'] = '%g' % data['top_p']
            params['stream'] = data["stream"]
            # 数组按照json结构拼接字符串
            message_str = ','.join(
                ['{{"role":"{}","content":"{}"}}'.format(message["role"], message["content"]) for message in
                 data["messages"]])
            message_str = '[{}]'.format(message_str)
            print(message_str)
            params['messages'] = message_str
            params['timestamp'] = str(data["timestamp"])
            params['expired'] = str(data["expired"])
            return params

if __name__ == '__main__':
    bucket = "yh-server-1325210923"
    region = "ap-guangzhou"
    tenCentCloud = TenCentCloudTool().init("1325210923")
    client = tenCentCloud.buildClient(region=region)

    data = client.upload_file(bucket="yh-server-1325210923", file=r"I:\AI\演示素材\印记迁移\印记迁移-效果11.png", fileName=r"model/1.jpg")
    print(data)
    # client.delete_obj(bucket, '/int')