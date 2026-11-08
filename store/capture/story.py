# story.py <lang>: the featured conversation: a shipping question the AI answers, an order question it hands over, Aiko answers.
import json, sys, time, urllib.request, os
S = os.path.dirname(os.path.abspath(__file__)) + '/rec'
X = json.load(open(S + '/texts.json'))[sys.argv[1]]
ws = open(S + '/ws.txt').read().strip()
cookie = '; '.join(l.split('\t')[5] + '=' + l.split('\t')[6].strip() for l in open(S + '/owner.jar') if 'hlc_' in l)
def req(path, body=None, h={}):
    r = urllib.request.Request('http://127.0.0.1:8080' + path, data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST',
        headers={'Content-Type': 'application/json', 'Host': 'chat.localhost:8080', **h})
    return json.load(urllib.request.urlopen(r))
W = {'Origin': 'https://shop.example.com', 'X-Forwarded-For': '203.0.113.50'}
A = {'Origin': 'http://chat.localhost:8080', 'Cookie': cookie}
name = {'en':'Mei Lin','ja':'林 美','ko':'린 메이','zh-TW':'林美','zh-CN':'林美','th':'Mei Lin','vi':'Mei Lin'}[sys.argv[1]]
out = req('/widget/v1/start', {'workspace_id': ws, 'visitor': {'name': name, 'email': 'mei@example.com', 'page': 'https://shop.example.com/products/sencha', 'locale': X['locale']}, 'text': X['q1']}, W)
v = {'workspace_id': ws, 'visitor_id': out['visitor_id'], 'visitor_token': out['visitor_token'], 'conversation_id': out['conversation']['id']}
cid = out['conversation']['id']
time.sleep(3)
req('/widget/v1/messages', {**v, 'text': X['q2']}, W); time.sleep(3)
me = req('/api/v1/me', None, A)
req('/api/v1/conversations/' + cid, {'assignee_id': me['agent']['id']}, A); time.sleep(1)
req('/api/v1/conversations/' + cid + '/messages', {'text': X['a1']}, A); time.sleep(1.5)
req('/widget/v1/messages', {**v, 'text': X['q3']}, W)
open(S + '/cid.txt', 'w').write(cid)
print('story', cid)
