# author:cxd
# datetime:2020/5/22/0022 14:51
# software: PyCharm
# remark:对象工具类
import datetime
import decimal


class ObjectTool:

    def typeof(self, variate):
        """
        获取值类型
        :param variate: 判断值
        :return:
        """
        type = None
        if isinstance(variate, int):
            type = "int"
        elif isinstance(variate, str):
            type = "str"
        elif isinstance(variate, float):
            type = "float"
        elif isinstance(variate, list):
            type = "list"
        elif isinstance(variate, tuple):
            type = "tuple"
        elif isinstance(variate, dict):
            type = "dict"
        elif isinstance(variate, set):
            type = "set"
        elif isinstance(variate, datetime.date):
            type = "datetime"
        else:
            if variate and len(variate) < 32:
                try:
                    if int.from_bytes(variate, byteorder='big') >= 0:
                        type = "bit"
                except TypeError:
                    type = None
        return type

    def toStr(self, value):
        """
        值转字符串类型
        :param value: 需要转换的值
        :return:
        """
        if value != None:
            return str(value)
        else:
            return value

    def parseVal(self, value):
        """
        格式化特殊类型
        :param value: 需要转换的值
        :return:
        """
        if isinstance(value, decimal.Decimal):
            value = float(value)
        else:
            type = self.typeof(value)
            if type == 'datetime':
                value = str(value)
            elif type == 'bit':
                value = int.from_bytes(value, byteorder='big')
            elif type == 'DB_TYPE_CLOB':
                value = value.read()
        return value


