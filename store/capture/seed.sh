#!/bin/bash
# seed.sh: fresh demo workspace on the local Live Chat (memory store).
set -e
S=$(cd "$(dirname "$0")" && pwd)
L=$LOG
H=(-H "Host: chat.localhost:8080" -H "Origin: http://chat.localhost:8080" -H "Content-Type: application/json")
U=http://127.0.0.1:8080/api/v1
link(){ sleep 0.3; grep -a "DEMO MAIL" $L | grep -a "to=$1" | tail -1 | sed 's/.*token=\([^"]*\)".*/\1/'; }
curl -s "${H[@]}" -X POST $U/login -d '{"email":"aiko@sakura-tea.example","locale":"en"}' >/dev/null
T=$(link aiko@sakura-tea.example)
curl -s -c $S/rec/owner.jar "${H[@]}" -X POST $U/login/verify -d "{\"token\":\"$T\"}" >/dev/null
curl -s -X POST -H "Content-Type: application/json" -H "Origin: http://localhost:8080" http://127.0.0.1:8080/admin/api/setup -d '{"token":"dev-setup-token-0123456789","email":"ops@hibira.example"}' >/dev/null
curl -s "${H[@]}" -X POST $U/console/login -d '{"email":"ops@hibira.example"}' >/dev/null
T=$(link ops@hibira.example)
curl -s -c $S/rec/op.jar "${H[@]}" -X POST $U/console/verify -d "{\"token\":\"$T\"}" >/dev/null
curl -s -b $S/rec/op.jar "${H[@]}" -X POST $U/console/settings -d '{"ai_enabled":true}' >/dev/null
WS=$(curl -s -b $S/rec/op.jar "${H[@]}" $U/console/workspaces | python3 -c 'import json,sys;print(json.load(sys.stdin)["workspaces"][0]["id"])')
curl -s -b $S/rec/op.jar "${H[@]}" -X POST $U/console/workspaces/$WS -d '{"plan":"team","reason":"demo"}' >/dev/null
P(){ curl -s -b $S/rec/owner.jar "${H[@]}" -X POST $U$1 -d "$2" | head -c 90; echo; }
LANG_=${1:-en}
INSTR=$(python3 -c "import json;print(json.load(open('$S/rec/texts.json'))['$LANG_']['instr'])")
P /workspace "{\"name\":\"Sakura Tea\",\"origins\":[\"https://shop.example.com\"],\"ai\":{\"enabled\":true,\"name\":\"Mia\",\"instructions\":\"$INSTR\"}}"

python3 -c "
import json,sys
d=json.load(open('$S/rec/texts.json'))['$LANG_']
for e in d['kb']:
    print(json.dumps({'kind': e[2] if len(e)>2 else 'qa','title':e[0],'body':e[1]},ensure_ascii=False))
" | while IFS= read -r line; do P /knowledge "$line"; done
echo $WS > $S/rec/ws.txt
AG=$(curl -s -b $S/rec/owner.jar "${H[@]}" $U/me | python3 -c 'import json,sys;print(json.load(sys.stdin)["agent"]["id"])')
P /agents/$AG '{"name":"Aiko"}'
