# story.py <lang>: the inbox's conversations. Four earlier visitors (two rated, one rated low with a
# thumbs-down on the AI's answer) and the featured chat: the AI answers shipping, hands over an order
# question, Aiko answers, the visitor rates 5.
import json, sys, time, urllib.request, os
S = os.path.dirname(os.path.abspath(__file__)) + '/rec'
L = sys.argv[1]
X = json.load(open(S + '/texts.json'))[L]
ws = open(S + '/ws.txt').read().strip()
cookie = '; '.join(l.split('\t')[5] + '=' + l.split('\t')[6].strip() for l in open(S + '/owner.jar') if 'hlc_' in l)
GOOD = {'en': 'So quick, thank you Aiko!', 'ja': '対応が早くて助かりました！', 'ko': '빠른 답변 감사해요!', 'zh-TW': '回覆好快，謝謝 Aiko！',
        'zh-CN': '回复好快，谢谢 Aiko！', 'th': 'ตอบเร็วมาก ขอบคุณค่ะ!', 'vi': 'Trả lời nhanh quá, cảm ơn Aiko!'}[L]
LOW = {'en': "I still don't know about customs fees.", 'ja': '関税がかかるのか分かりませんでした。', 'ko': '관세가 붙는지 여전히 모르겠어요.',
       'zh-TW': '還是不知道要不要付關稅。', 'zh-CN': '还是不知道要不要付关税。', 'th': 'ยังไม่รู้เลยว่าต้องเสียภาษีนำเข้าไหม', 'vi': 'Mình vẫn chưa biết có phải đóng thuế không.'}[L]
NAME = {'en': 'Mei Lin', 'ja': '林 美', 'ko': '린 메이', 'zh-TW': '林美', 'zh-CN': '林美', 'th': 'Mei Lin', 'vi': 'Mei Lin'}[L]
def req(path, body=None, h={}):
    r = urllib.request.Request('http://127.0.0.1:8080' + path, data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST',
        headers={'Content-Type': 'application/json', 'Host': 'chat.localhost:8080', **h})
    try:
        return json.load(urllib.request.urlopen(r))
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{path}: {e.code} {e.read()[:200]}')
A = {'Origin': 'http://chat.localhost:8080', 'Cookie': cookie}
me = req('/api/v1/me', None, A)['agent']['id']
def start(i, name, email, page, text):
    W = {'Origin': 'https://shop.example.com', 'X-Forwarded-For': f'203.0.113.{10 + i}'}
    out = req('/widget/v1/start', {'workspace_id': ws, 'visitor': {'name': name, 'email': email, 'page': 'https://shop.example.com' + page, 'locale': X['locale']}, 'text': text}, W)
    who = {'workspace_id': ws, 'visitor_id': out['visitor_id'], 'visitor_token': out['visitor_token'], 'conversation_id': out['conversation']['id']}
    return who, W
def ai_seq(who, W):
    for _ in range(20):
        ms = [m for m in req('/widget/v1/history', who, W)['messages'] if m.get('sender') == 'ai']
        if ms: return ms[0]['seq']
        time.sleep(0.5)
time.sleep(4)  # the new workspace's app reaches the router within a few seconds
bg = []
for i, (name, email, page, text) in enumerate(X['bg']):
    bg.append(start(i, name, email, page, text)); time.sleep(2.5)
emma, noah, olivia, liam = bg
req('/api/v1/conversations/' + noah[0]['conversation_id'], {'assignee_id': me}, A)
req('/widget/v1/feedback', {**emma[0], 'seq': ai_seq(*emma), 'helpful': True}, emma[1])
req('/widget/v1/rate', {**emma[0], 'score': 5}, emma[1])
req('/widget/v1/rate', {**olivia[0], 'score': 4}, olivia[1])
req('/widget/v1/feedback', {**liam[0], 'seq': ai_seq(*liam), 'helpful': False, 'reason': 'unclear'}, liam[1])
req('/widget/v1/rate', {**liam[0], 'score': 2, 'comment': LOW}, liam[1])
time.sleep(2)
v, W = start(9, NAME, 'mei@example.com', '/products/sencha', X['q1'])
cid = v['conversation_id']
time.sleep(3)
req('/widget/v1/messages', {**v, 'text': X['q2']}, W); time.sleep(3)
req('/api/v1/conversations/' + cid, {'assignee_id': me}, A); time.sleep(1)
req('/api/v1/conversations/' + cid + '/messages', {'text': X['a1']}, A); time.sleep(1.5)
req('/widget/v1/messages', {**v, 'text': X['q3']}, W); time.sleep(1)
req('/widget/v1/rate', {**v, 'score': 5, 'comment': GOOD}, W)
open(S + '/cid.txt', 'w').write(cid)
open(S + '/low.txt', 'w').write(liam[0]['conversation_id'])
print('story', cid)
