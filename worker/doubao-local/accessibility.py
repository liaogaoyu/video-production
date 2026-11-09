"""Dependency-free macOS Accessibility adapter for the Doubao desktop client."""
import ctypes as C
import json
import subprocess
import sys
import time

CF = C.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
AX = C.CDLL('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices')
P = C.c_void_p


def bind(lib, name, result, *args):
    fn = getattr(lib, name)
    fn.restype, fn.argtypes = result, list(args)
    return fn


string = bind(CF, 'CFStringCreateWithCString', P, P, C.c_char_p, C.c_uint)
release = bind(CF, 'CFRelease', None, P)
type_id = bind(CF, 'CFGetTypeID', C.c_ulong, P)
string_id = bind(CF, 'CFStringGetTypeID', C.c_ulong)
array_id = bind(CF, 'CFArrayGetTypeID', C.c_ulong)
length = bind(CF, 'CFStringGetLength', C.c_long, P)
to_string = bind(CF, 'CFStringGetCString', C.c_bool, P, C.c_char_p, C.c_long, C.c_uint)
count = bind(CF, 'CFArrayGetCount', C.c_long, P)
item = bind(CF, 'CFArrayGetValueAtIndex', P, P, C.c_long)
copy_attr = bind(AX, 'AXUIElementCopyAttributeValue', C.c_int, P, P, C.POINTER(P))
set_attr = bind(AX, 'AXUIElementSetAttributeValue', C.c_int, P, P, P)
press = bind(AX, 'AXUIElementPerformAction', C.c_int, P, P)
application = bind(AX, 'AXUIElementCreateApplication', P, C.c_int)
trusted = bind(AX, 'AXIsProcessTrusted', C.c_bool)


class Point(C.Structure):
    _fields_ = [('x', C.c_double), ('y', C.c_double)]


def return_key(element, code=36, flags=0):
    pid = C.c_int()
    if bind(AX, 'AXUIElementGetPid', C.c_int, P, C.POINTER(C.c_int))(element, C.byref(pid)):
        raise RuntimeError('无法定位输入目标进程')
    create = bind(AX, 'CGEventCreateKeyboardEvent', P, P, C.c_ushort, C.c_bool)
    post = bind(AX, 'CGEventPost', None, C.c_uint, P)
    for down in (True, False):
        event = create(None, code, down)
        bind(AX, 'CGEventSetFlags', None, P, C.c_ulonglong)(event, flags)
        post(0, event)
        release(event)
        time.sleep(0.05)


def click(element, twice=False):
    subprocess.run(['osascript', '-l', 'JavaScript', '-e',
                    'Application("System Events").processes.whose({bundleIdentifier:"com.bot.pc.doubao"})()[0].frontmost=true'],
                   check=True, capture_output=True)
    position, size = attribute(element, 'AXPosition'), attribute(element, 'AXSize')
    if not position or not size:
        raise RuntimeError('控件缺少可见位置')
    get_value = bind(AX, 'AXValueGetValue', C.c_bool, P, C.c_int, P)
    origin, dimensions = Point(), Point()
    try:
        if not get_value(position, 1, C.byref(origin)) or not get_value(size, 2, C.byref(dimensions)):
            raise RuntimeError('无法读取控件位置')
    finally:
        release(position)
        release(size)
    create = bind(AX, 'CGEventCreateMouseEvent', P, P, C.c_uint, Point, C.c_uint)
    post = bind(AX, 'CGEventPost', None, C.c_uint, P)
    set_integer = bind(AX, 'CGEventSetIntegerValueField', None, P, C.c_uint, C.c_longlong)
    center = Point(origin.x + dimensions.x / 2, origin.y + dimensions.y / 2)
    for kind, clicks in ([(5, 1), (1, 1), (2, 1), (1, 2), (2, 2)] if twice else [(5, 1), (1, 1), (2, 1)]):
        event = create(None, kind, center, 0)
        if not event:
            raise RuntimeError('无法创建鼠标事件')
        set_integer(event, 1, clicks)
        post(0, event)
        release(event)
        time.sleep(0.05)


def cf_string(value):
    return string(None, value.encode(), 0x08000100)


def text(value):
    if not value or type_id(value) != string_id():
        return ''
    buffer = C.create_string_buffer(length(value) * 4 + 1)
    if to_string(value, buffer, len(buffer), 0x08000100):
        return buffer.value.decode('utf-8')
    return ''


def attribute(element, name):
    key, result = cf_string(name), P()
    try:
        code = copy_attr(element, key, C.byref(result))
        return result.value if code == 0 else None
    finally:
        release(key)


def value(element, name):
    result = attribute(element, name)
    try:
        return text(result)
    finally:
        if result:
            release(result)


def children(element):
    result = attribute(element, 'AXChildren')
    if not result:
        return []
    try:
        if type_id(result) != array_id():
            return []
        retain = bind(CF, 'CFRetain', P, P)
        return [retain(item(result, i)) for i in range(count(result))]
    finally:
        release(result)


def bounds(element):
    result = []
    for name, kind in [('AXPosition', 1), ('AXSize', 2)]:
        raw = attribute(element, name)
        if not raw:
            return None
        point = Point()
        try:
            if not bind(AX, 'AXValueGetValue', C.c_bool, P, C.c_int, P)(raw, kind, C.byref(point)):
                return None
            result.extend([point.x, point.y])
        finally:
            release(raw)
    return result


def snapshot():
    if not trusted():
        raise RuntimeError('需要为运行此脚本的终端开启 macOS 辅助功能权限')
    pid_text = subprocess.check_output([
        'osascript', '-l', 'JavaScript', '-e',
        'Application("System Events").processes.whose({bundleIdentifier:"com.bot.pc.doubao"})()[0].unixId()'
    ], text=True).strip()
    root = application(int(pid_text))
    focused = attribute(root, 'AXFocusedWindow')
    if focused:
        release(root)
        root = focused
    # Native modal panels otherwise leave a large, inaccessible web tree behind them.
    for _ in range(2):
        sheets = attribute(root, 'AXSheets')
        if not sheets:
            break
        try:
            if type_id(sheets) != array_id() or count(sheets) == 0:
                break
            sheet = bind(CF, 'CFRetain', P, P)(item(sheets, 0))
        finally:
            release(sheets)
        if bind(CF, 'CFEqual', C.c_bool, P, P)(sheet, root):
            release(sheet)
            break
        release(root)
        root = sheet
    nodes = []

    def walk(element, parent, depth):
        if depth > 60 or len(nodes) > 10000:
            release(element)
            raise RuntimeError('豆包界面树过大，停止操作')
        index = len(nodes)
        nodes.append({
            'element': element, 'parent': parent,
            'role': value(element, 'AXRole'),
            'title': value(element, 'AXTitle'),
            'description': value(element, 'AXDescription'),
            'value': value(element, 'AXValue'),
            'help': value(element, 'AXHelp'),
            'identifier': value(element, 'AXIdentifier'),
        })
        for child in children(element):
            walk(child, index, depth + 1)

    walk(root, None, 0)
    for node in nodes:
        if node['help'] == '双击编辑标题' and node['parent'] is not None:
            parent = nodes[node['parent']]
            parent['bounds'] = bounds(parent['element'])
        if node['description'] == '视频生成失败':
            node['bounds'] = bounds(node['element'])
    return nodes


def main():
    request = json.load(sys.stdin)
    nodes = snapshot()
    try:
        if request['action'] == 'snapshot':
            print(json.dumps([{k: v for k, v in n.items() if k != 'element'} for n in nodes], ensure_ascii=False))
            return
        if request['action'] == 'path-dialog':
            if not any(n['role'] == 'AXButton' and n['title'] == '取消' for n in nodes):
                raise RuntimeError('文件选择窗口未打开')
            subprocess.run(['osascript', '-l', 'JavaScript', '-e',
                            'Application("System Events").processes.whose({bundleIdentifier:"com.bot.pc.doubao"})()[0].frontmost=true'], check=True, capture_output=True)
            return_key(nodes[0]['element'], 5, (1 << 20) | (1 << 17))
            print(json.dumps({'ok': True}))
            return
        matches = [n for n in nodes if n['role'] == request['role'] and
                   request['label'] in (n['title'], n['description'], n['value'], n['identifier'])]
        if request['action'] == 'title':
            matches = [n for n in nodes if n['role'] == 'AXStaticText' and n['parent'] is not None and
                       nodes[n['parent']]['help'] == '双击编辑标题']
        if request['action'] in ('submit', 'reference-menu'):
            inputs = [i for i, n in enumerate(nodes) if n['role'] == 'AXTextArea' and n['value'] == request['label']]
            if len(inputs) != 1:
                raise RuntimeError('无法唯一定位本任务提示词')
            parent = nodes[inputs[0]]['parent']
            matches = []
            while parent is not None:
                descendants = []
                for index, node in enumerate(nodes):
                    ancestor = index
                    while ancestor is not None and ancestor != parent:
                        ancestor = nodes[ancestor]['parent']
                    if ancestor == parent:
                        descendants.append(node)
                if any(n['role'] == 'AXPopUpButton' and n['title'] == '视频生成' for n in descendants):
                    if request['action'] == 'submit':
                        # The submit button lives beside the generation controls, outside attachment thumbnails.
                        controls = next(n for n in descendants if n['role'] == 'AXPopUpButton' and n['title'] == '视频生成')
                        ancestor = nodes.index(controls)
                        ancestor = nodes[ancestor]['parent']
                        matches = []
                        while ancestor is not None and ancestor != parent:
                            for candidate in descendants:
                                if candidate['role'] != 'AXButton':
                                    continue
                                node_index = nodes.index(candidate)
                                while node_index is not None and node_index != ancestor:
                                    node_index = nodes[node_index]['parent']
                                if node_index == ancestor:
                                    matches.append(candidate)
                            if matches:
                                break
                            ancestor = nodes[ancestor]['parent']
                    else:
                        matches = []
                        for candidate in descendants:
                            if candidate['role'] != 'AXPopUpButton' or candidate['title'] or candidate['description']:
                                continue
                            rectangle = bounds(candidate['element'])
                            if rectangle and rectangle[2] >= 8 and rectangle[3] >= 8:
                                matches.append(candidate)
                    break
                parent = nodes[parent]['parent']
        if len(matches) != 1:
            raise RuntimeError(f'控件必须唯一，当前匹配 {len(matches)} 个')
        target = matches[0]['element']
        if request['action'] in ('click', 'submit', 'title', 'reference-menu'):
            click(target, twice=request['action'] == 'title')
            code = 0
        elif request['action'] in ('commit-title', 'commit-path', 'create-canvas'):
            if request['action'] == 'commit-title' and matches[0]['description'] != '编辑素材标题':
                raise RuntimeError('只能提交素材标题')
            if request['action'] == 'create-canvas' and matches[0]['value'] != '创建新画布':
                raise RuntimeError('画布创建命令不匹配')
            click(target)
            return_key(target)
            code = 0
        elif request['action'] == 'press':
            name = cf_string('AXPress')
            try:
                code = press(target, name)
            finally:
                release(name)
        elif request['action'] in ('increment', 'decrement'):
            name = cf_string('AXIncrement' if request['action'] == 'increment' else 'AXDecrement')
            try:
                code = press(target, name)
            finally:
                release(name)
        elif request['action'] == 'fill':
            name, content = cf_string('AXValue'), cf_string(request['text'])
            try:
                code = set_attr(target, name, content)
            finally:
                release(name)
                release(content)
        else:
            raise RuntimeError('未知操作')
        if code:
            raise RuntimeError(f'辅助功能操作失败 {code}')
        print(json.dumps({'ok': True}))
    finally:
        for node in nodes:
            release(node['element'])


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False))
        sys.exit(1)
