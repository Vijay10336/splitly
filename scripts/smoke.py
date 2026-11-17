"""Exercise the Docker stack, including real SMTP delivery into local Mailpit."""
import json
import re
import time
import tempfile
import uuid
import urllib.request
import urllib.error
from pathlib import Path

BASE = 'http://localhost:18090'
MAIL = 'http://localhost:18025'
PASSWORD = 'demo-expenses-2026'

def request(path, body=None, token=None, status=200, base=BASE):
    headers = {}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            assert response.status == status
            return json.load(response)
    except urllib.error.HTTPError as error:
        data = json.load(error)
        assert error.code == status, (path, error.code, data)
        return data

def last_email(email, subject):
    for _ in range(20):
        messages = request('/api/v1/messages', base=MAIL)['messages']
        for message in messages:
            if message['Subject'] == subject and any(to['Address'] == email for to in message['To']):
                return request('/api/v1/message/' + message['ID'], base=MAIL)
        time.sleep(.25)
    raise AssertionError('Email not delivered: ' + subject)

def signup(email, name='Vijay'):
    return request('/api/auth/signup', {'name': name, 'email': email, 'password': PASSWORD})

def command(token, group_id, kind, payload, command_id=None, status=200):
    body = {'id': command_id or str(uuid.uuid4()), 'type': kind, 'groupId': group_id, 'payload': payload}
    request('/api/commands', body, token, status)
    return body

for _ in range(30):
    try:
        request('/api/health')
        break
    except (OSError, AssertionError):
        time.sleep(1)
else:
    raise AssertionError('App did not become healthy')

suffix = str(int(time.time()))
email = f'vijay.demo.{suffix}@example.com'
account = signup(email)
token = account['token']
verification = last_email(email, 'Verify your Splitly email')
verify_token = re.search(r'verify=([\w-]+)', verification['Text']).group(1)
request('/api/auth/verify', {'token': verify_token})
request('/api/auth/verify', {'token': verify_token}, status=400)
friend_email = f'ananya.demo.{suffix}@example.com'
people = [{'id': str(uuid.uuid4()), 'name': name, 'email': address} for name, address in
          [('Vijay', email), ('Ananya', friend_email), ('Rahul', ''), ('Priya', '')]]
for group_name, expenses in [
    ('Goa weekend', [('Dinner by the sea', 240000, 0), ('Airport taxi', 120000, 1), ('Morning coffee', 68000, 0)]),
    ('The flat', [('Weekly groceries', 185000, 0), ('Internet', 99900, 2)]),
    ('Friday dinners', [('Pizza night', 156000, 3)])
]:
    group_id = str(uuid.uuid4())
    members = [{**person, 'id': str(uuid.uuid4())} for person in people]
    command(token, group_id, 'createGroup', {'name': group_name, 'currency': 'INR', 'members': members})
    for title, amount, payer in expenses:
        payload = {'title': title, 'amount': amount, 'payerId': members[payer]['id'], 'participants': [m['id'] for m in members]}
        change = command(token, group_id, 'addExpense', payload)
        request('/api/commands', change, token)
    state = request('/api/state', token=token)
    group = next(g for g in state['groups'] if g['id'] == group_id)
    assert len(group['expenses']) == len(expenses)
    assert sum(m['balance'] for m in group['members']) == 0
    if group_name == 'Goa weekend':
        assert sum(s['amount'] for s in group['expenses'][0]['shares']) == group['expenses'][0]['amount']
        deb = next(m for m in group['members'] if m['balance'] < 0)
        cred = next(m for m in group['members'] if m['balance'] > 0)
        amount = min(-deb['balance'], cred['balance'])
        command(token, group_id, 'settle', {'fromId': deb['id'], 'toId': cred['id'], 'amount': amount})
        stranger = signup(f'stranger.{suffix}@example.com')
        command(stranger['token'], group_id, 'addExpense', payload, status=403)

friend = signup(friend_email, 'Ananya')
assert len(request('/api/state', token=friend['token'])['groups']) == 0
friend_verify = re.search(r'verify=([\w-]+)', last_email(friend_email, 'Verify your Splitly email')['Text']).group(1)
request('/api/auth/verify', {'token': friend_verify})
assert len(request('/api/state', token=friend['token'])['groups']) == 3
request('/api/backup/email', {}, token)
backup = last_email(email, 'Your Splitly backup')
assert any(a['FileName'] == 'splitly-backup.json' for a in backup['Attachments'])
request('/api/backup/email', {}, token, 429)
request('/api/auth/forgot', {'email': friend_email})
reset = re.search(r'reset=([\w-]+)', last_email(friend_email, 'Reset your Splitly password')['Text']).group(1)
request('/api/auth/reset', {'token': reset, 'password': 'new-password-2026'})
request('/api/auth/reset', {'token': reset, 'password': 'other-password-2026'}, status=400)
request('/api/state', token=friend['token'], status=401)
request('/api/auth/login', {'email': friend_email, 'password': 'new-password-2026'})
request('/api/state', status=401)
request('/api/auth/google/config')
login_file = Path(tempfile.gettempdir()) / 'splitly-demo-account.json'
login_file.write_text(json.dumps({'email': email, 'password': PASSWORD}))
print('PASS: Docker health, signup, verification, shared groups, expense splits, retry deduplication, settlements, access control, email attachment, reset and session revocation.')
print(f'Demo login saved to {login_file}')
