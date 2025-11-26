import calendar
import time, datetime
from dateutil.parser import parse


class DateTool:
    """
        字符串时间转时间戳
        :param  val：要转换的值
        :param  forMat: 格式化日期（暂时没用，不支持yyyy-MM-dd格式）
    """

    def strToTimeStamp(self, val, forMat="%Y-%m-%d %H:%M:%S"):
        # 将传入的时间统一格式为datetime
        d = parse(val)
        # 转为时间数组
        dateStr = d.strftime(forMat);
        print(dateStr)
        timeArray = time.strptime(dateStr, forMat)
        # 转为时间戳
        timeStamp = int(time.mktime(timeArray))
        print(timeStamp)
        return timeStamp

    """
        字符串时间格式化
        :param  val:要转换的值
        :param  forMat:格式化日期
    """

    def strToFormat(self, val, forMat="%Y-%m-%d %H:%M:%S"):
        # 转为数组
        timeArray = time.strptime(val, "%Y-%m-%d %H:%M:%S")
        # 转为其它显示格式
        otherStyleTime = time.strftime(forMat, timeArray)
        print(otherStyleTime)
        return otherStyleTime

    """
        时间戳转时间
        :param  val:要转换的值
        :param  forMat:格式化日期
    """

    def timeStampToDateTime(self, val, forMat="%Y-%m-%d %H:%M:%S"):
        try:
            dateArray = datetime.datetime.fromtimestamp(val)
            otherStyleTime = dateArray.strftime(forMat)
            otherStyleTime = datetime.datetime.strptime(otherStyleTime, forMat)
            print(otherStyleTime)
            return otherStyleTime
        except Exception as e:
            print(e)
            return None

    """
        得到当前日期时间
        :param  forMat:格式化日期
    """

    def getDateTime(self, forMat="%Y-%m-%d %H:%M:%S"):
        now = int(time.time())
        timeArray = time.localtime(now)
        otherStyleTime = time.strftime(forMat, timeArray)
        print(otherStyleTime)
        return otherStyleTime

    """
        得到当前日期返回字符串格式
        :param  forMat:格式化日期
    """

    def getDateStr(self, forMat="%Y-%m-%d %H:%M:%S"):
        now_time = datetime.datetime.now()
        time1_str = datetime.datetime.strftime(now_time, forMat)
        print('oldtime' + time1_str)
        return time1_str

    """
        得到前几天的00:00:00 时间字符串
        :param  forMat:格式化日期
    """

    @staticmethod
    def getOldDayStart(offset):
        now = time.time()
        midnight = now - (now % (86400 * offset)) + time.timezone
        pre_midnight = midnight - 86400
        start_time = datetime.datetime.strptime(time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(pre_midnight)),
                                                "%Y-%m-%d %H:%M:%S")
        return start_time

    """
        得到前几天的23:59:59 时间字符串
        :param  forMat:格式化日期
    """

    @staticmethod
    def getOldDayEnd(offset):
        now = time.time()
        midnight = now - (now % (86400 * offset)) + time.timezone
        now_midnight = midnight - 1
        end_time = datetime.datetime.strptime(time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now_midnight)),
                                              "%Y-%m-%d %H:%M:%S")
        return end_time

    """
        得到指定日期月份的第一天和最后一天时间
        :param date:%Y-%m-%d格式的日期
    """

    def get_current_month_start_and_end(self, date):
        """
        年份 date格式: 2017-09-08
        :param date:
        :return: 本月第一天日期和本月最后一天日期
        """
        if date.count('-') != 2:
            raise ValueError('- is error')
        year, month = str(date).split('-')[0], str(date).split('-')[1]
        end = calendar.monthrange(int(year), int(month))[1]
        start_date = '%s-%s-01 00:00:00' % (year, month)
        end_date = '%s-%s-%s 23:59:59' % (year, month, end)
        print(start_date, end_date)
        return start_date, end_date

    """
        获取两个日期的相差天数
    """

    def caltime(self, date1, date2):
        # %Y-%m-%d为日期格式，其中的-可以用其他代替或者不写，但是要统一，同理后面的时分秒也一样；可以只计算日期，不计算时间。
        # date1=time.strptime(date1,"%Y-%m-%d %H:%M:%S")
        # date2=time.strptime(date2,"%Y-%m-%d %H:%M:%S")
        date1 = time.strptime(date1, "%Y-%m-%d")
        date2 = time.strptime(date2, "%Y-%m-%d")
        # 根据上面需要计算日期还是日期时间，来确定需要几个数组段。下标0表示年，小标1表示月，依次类推...
        # date1=datetime.datetime(date1[0],date1[1],date1[2],date1[3],date1[4],date1[5])
        # date2=datetime.datetime(date2[0],date2[1],date2[2],date2[3],date2[4],date2[5])
        date1 = datetime.datetime(date1[0], date1[1], date1[2])
        date2 = datetime.datetime(date2[0], date2[1], date2[2])
        # 返回两个变量相差的值，就是相差天数
        return (date2 - date1).days

    """
        获取两个日期的相差秒数，分钟，返回格式：描述,分钟
    """

    def caltime1(self, date1, date2):
        time_1_struct = datetime.datetime.strptime(date1, "%Y-%m-%d %H:%M:%S")
        time_2_struct = datetime.datetime.strptime(date2, "%Y-%m-%d %H:%M:%S")

        # 来获取时间差中的秒数。注意，seconds获得的秒只是时间差中的小时、分钟和秒部分，没有包含天数差，total_seconds包含天数差
        # 所以total_seconds两种情况都是可以用的
        total_seconds = (time_2_struct - time_1_struct).total_seconds()
        print('不同天的秒数为：')
        print(int(total_seconds))
        min_sub = total_seconds / 60
        print('不同天的分钟数为：')
        print(int(min_sub))
        return int(total_seconds), int(min_sub)

    """
       计算传入的时间，加上传入天数
    """

    def calDay(self, date1, day=0, forMat="%Y-%m-%d"):
        """
            默认格式date: 2021-03-19
        :date1
        :alertDate 计算的 天数
        """
        if day == 0:
            return date1
        elif day > 0:
            return datetime.datetime.strptime(date1, forMat) - datetime.timedelta(days=day)
        else:
            return datetime.datetime.strptime(date1, forMat) + datetime.timedelta(days=day)


    """
        取上个月月份
    """
    def get_last_month_day(self):
        now_time = datetime.datetime.now()
        end_day_in_mouth = now_time.replace(day=1)
        next_mouth = end_day_in_mouth - datetime.timedelta(days=1)
        return next_mouth.month, next_mouth.day


if __name__ == '__main__':
    dateTool = DateTool()
    """
    dateTool.strToTimeStamp('2020-05-01 23:59:59')
    dateTool.strToFormat('2020-05-01 23:59:59', '%Y-%m-%d')
    dateTool.timeStampToDateTime(1587549600, '%Y-%m-%d')
    dateTool.strToTimeStamp(str(dateTool.timeStampToDateTime(1587549600, '%Y-%m-%d')))
    dateTool.getDateTime('%Y-%m-%d')
    dateTool.getDateStr()
    dateTool.get_current_month_start_and_end('2019-05-24')"""
    # print(dateTool.getDateStr('%Y-%m-%d'))
    # print(dateTool.strToFormat('2020-05-01 00:00:00', '%Y-%m-%d'))
    # print(dateTool.caltime1('2021-07-08 17:59:50', dateTool.getDateTime()))
    # print(dateTool.caltime('2020-05-01', dateTool.getDateStr('%Y-%m-%d')))
    print(dateTool.get_last_month())
