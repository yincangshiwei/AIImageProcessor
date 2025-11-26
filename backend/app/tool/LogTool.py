# author:cxd
# datetime:2020/5/29/0029 15:04
# software: PyCharm
# remark:日志工具类：输出局部日志（用于生成指定类和函数日志）
#        日志文件生成在logs/(path)/年月日.log里面
#        使用方式：
#        log = LogTool('同一个类生成不同日志需填写',path='日志路径').init()
#        log.级别函数(日志内容)
import logging
import os.path
import time
import sys
from pathlib import Path

import backend.app.globalvar as gl

class LogTool(object):
    def __init__(self, name=None, path=str(Path(__file__))[str(Path(__file__)).find('app'):len(str(Path(__file__)))].replace('.py', '') + '/'):
        """

        :param name: 想在同一个Py里面，不同的内容生成到不同的日志，则需填写name来区分，否则内容都会存在所有日志里面。
        :param path: 日志具体路径，不填默认是日志工具类的路径。
        """
        # 创建一个logger
        self.logger = logging.getLogger(name)
        self.path = path

    def init(self):
        logger = self.logger
        logger.setLevel(logging.DEBUG)
        # 清空handlers
        logger.handlers = []
        # 移除handlers配置
        logger.removeHandler(logger.handlers)
        # 定义生成文件目录路径
        rootPath = gl.rootPath
        rq = time.strftime('%Y%m%d', time.localtime(time.time()))
        log_path = rootPath + 'logs/' + self.path
        if not os.path.exists(log_path):  # 检查文件目录是否存在，不存在则新增目录
            os.makedirs(log_path)
        log_name = log_path + rq + '.log'
        logfile = log_name
        # 再进行一层判断
        if not logger.handlers:
            # print(self.log_name)
            # 创建一个handler，用于写入日志文件
            fh = logging.FileHandler(filename=logfile, encoding='utf-8')
            fh.setLevel(logging.DEBUG)

            # 再创建一个handler，用于输出到控制台
            ch = logging.StreamHandler(sys.stdout)
            ch.setLevel(logging.DEBUG)

            # 定义handler的输出格式
            formatter = logging.Formatter(
                '[%(asctime)s] %(filename)s->%(funcName)s line:%(lineno)d [%(levelname)s]%(message)s')
            fh.setFormatter(formatter)
            ch.setFormatter(formatter)

            # 给logger添加handler
            logger.addHandler(fh)
            logger.addHandler(ch)

            # 关闭打开的文件
            fh.close()
            ch.close()
        return logger

    def debug(self, message):
        logger = self.init()
        logger.debug(message)

    def info(self, message):
        logger = self.init()
        logger.info(message)

    def error(self, message):
        logger = self.init()
        logger.error(message)
