import json
import app.globalvar as gl

from datetime import datetime, date

from DateTool import DateTool
from ObjectTool import ObjectTool


class JsonTool:

    def __init__(self):
        self.dateTool = DateTool()
        self.objectTool = ObjectTool()

    @staticmethod
    def loadFont(filePath):
        f = open(gl.rootPath + filePath, encoding='utf-8')  # 设置以utf - 8
        # 解码模式读取文件，encoding参数必须设置，否则默认以gbk模式读取文件，当文件中包含中文时，会报错
        jsonData = json.load(f)
        return jsonData


    def jsonToColumnsAndValues(self, json, columns, values):
        for key in json:
            # print("****key2--：%s value--: %s" % (key, approvalDetailInfo[key]))
            columns.append(key)
            value = json[key]
            if self.objectTool.typeof(value) == 'int' and len(str(value)) == 10 and self.dateTool.timeStampToDateTime(value) != None:
                value = self.dateTool.timeStampToDateTime(value)
            values.append(self.objectTool.toStr(value))
        return columns, values

    class Datatojson(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, datetime):
                # return obj.strftime("%Y年%m月%d日 %H时%M分%S秒")
                return obj.strftime("%Y-%m-%d %H:%M:%S")
            elif isinstance(obj, date):
                # return obj.strftime("%Y年%m月%d日")
                return obj.strftime("%Y-%m-%d")
            else:
                return json.JSONEncoder.default(self, obj)


if __name__ == '__main__':
    jsonTool = JsonTool()
    # jsonData = jsonTool.loadFont('sources/json/db/database.json')
    # dataBase = 'bs'
    # print(jsonData[dataBase]['cs'])
    # 格式化json日期
    # d = {'name': 'bill', 'date': datetime.now()}
    # print(json.dumps(d, cls=jsonTool.Datatojson))
