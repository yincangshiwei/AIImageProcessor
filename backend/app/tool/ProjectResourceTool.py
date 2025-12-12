# @Author : cxd
# @DateTime : 2021/8/3/0003 12:04
# @File : ProjectResourceTool.py
# @remark : 项目资源工具类（用于获取不同渠道的资源配置信息）
from app.tool.LogTool import LogTool
from pathlib import Path
from app.tool.JsonTool import JsonTool

class ProjectResourceTool(object):
    def __init__(self, log=LogTool(path=str(Path(__file__))[str(Path(__file__)).find('app'):len(str(Path(__file__)))].replace('.py', '') + '/')):
        self.apolloTool = None
        self.log = log
        self.reqData = None
        self.req_name = None

    def get(self, param, **kwargs):
        """
        :param param:
            如果type是Local，填json所在路径即可；
            如果type是apollo，填写apollo地址需要的参数，具体参考apollo开放平台
            例："appId": "", "clusterName": "", "namespaceName": ""
        :param kwargs: 扩展参数，type为apollo时可传递req_name参数，用于区分调用哪个地址，默认是获取发布的namespace配置信息
        :return:
        """
        log = self.log
        log.debug('开始读取项目资源信息')
        log.debug('读取本地资源')
        jsonData = JsonTool().loadFont(param)
        return jsonData


if __name__ == '__main__':
    projectResourceTool = ProjectResourceTool()
    param = "conf/tenCentCloud.json"
    companies = projectResourceTool.get(param)
    print(companies)