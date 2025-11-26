import json


class SuccessObj(object):
    success: False
    data: ''

    def __init__(self):
        self.count = 0
        self.isException = False
        self.id = ''

    def set_data(self, success=False, data=''):
        self.success = success
        self.data = data

    # Always return a Python dict. If you need JSON, wrap with json.dumps(...) at call site.
    def dic(self, no_ascii=False):
        return {
            'success': self.success,
            'data': self.data,
            'count': self.count,
            'isException': self.isException,
            'id': self.id
        }

