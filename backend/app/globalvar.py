"""
    定义全局变量

"""
import os

print('进入globalvar')
projectName = 'backend'
curPath = os.path.abspath(os.path.dirname(__file__))
index = curPath.find(projectName)
rootPath = curPath[:index + len(projectName)] + '/'
print(rootPath)
