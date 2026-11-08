# seedbg.py <lang>: four earlier visitors, so the inbox looks like a working day.
import json, sys, time, urllib.request, http.cookiejar, os
S = os.path.dirname(os.path.abspath(__file__))
lang = sys.argv[1]
X = json.load(open(os.path.join(S, 'texts.json')))[lang]
ws = open(os.path.join(S, 'ws.txt')).read().strip()
def post(path, body, headers):
    r = urllib.request.Request('http://127.0.0.1:8080' + path, data=json.dumps(body).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'Host': 'chat.localhost:8080', **headers})
    return json.load(urllib.request.urlopen(r))
convs = []
time.sleep(4)  # the new workspace's app reaches the router within a few seconds
for i, (name, email, page, text) in enumerate(X['bg']):
    out = post('/widget/v1/start', {'workspace_id': ws, 'visitor': {'name': name, 'email': email, 'page': 'https://shop.example.com' + page, 'locale': X['locale']}, 'text': text},
               {'Origin': 'https://shop.example.com', 'X-Forwarded-For': f'203.0.113.{10+i}'})
    convs.append(out['conversation']['id'])
    time.sleep(2.0)
# Aiko takes the order question.
cookie = '; '.join(l.split('\t')[5] + '=' + l.split('\t')[6].strip() for l in open(os.path.join(S, 'owner.jar')) if 'hlc_' in l)
me = json.load(urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8080/api/v1/me', headers={'Host': 'chat.localhost:8080', 'Cookie': cookie})))
post('/api/v1/conversations/' + convs[1], {'assignee_id': me['agent']['id']}, {'Origin': 'http://chat.localhost:8080', 'Cookie': cookie})
print('bg', convs)
