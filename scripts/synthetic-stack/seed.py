"""Seed the local synthetic stack: auth users through the local GoTrue admin API,
then fictional orgs / people / leads / messages / events / tasks / notifications.
Everything here is invented. Run via scripts/synthetic-stack/setup.sh (or: python3 -I seed.py <stack_dir>)."""
import json
import os
import random
import secrets
import subprocess
import sys
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

stack = sys.argv[1]
env = dict(l.strip().split('=', 1) for l in open(os.path.join(stack, '.env.synth')) if '=' in l)
env = {k: v.strip('"') for k, v in env.items()}
pw_path = os.path.join(stack, '.synth_password')
if not os.path.exists(pw_path):
    with open(pw_path, 'w') as f:
        f.write('Synth-' + secrets.token_urlsafe(18))
    os.chmod(pw_path, 0o600)
password = open(pw_path).read().strip()

random.seed(20261101)
NOW = datetime.now(timezone.utc).replace(microsecond=0)
ns = uuid.UUID('6b1f0000-0000-4000-8000-000000000000')
def uid(*parts):
    return str(uuid.uuid5(ns, ':'.join(map(str, parts))))

def gotrue(method, path, body=None):
    req = urllib.request.Request(env['API_URL'] + '/auth/v1' + path, method=method,
                                 data=json.dumps(body).encode() if body else None)
    req.add_header('apikey', env['SERVICE_ROLE_KEY'])
    req.add_header('Authorization', 'Bearer ' + env['SERVICE_ROLE_KEY'])
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return {'_status': e.code, '_body': e.read().decode()[:200]}

existing = {u['email']: u['id'] for u in gotrue('GET', '/admin/users?per_page=200').get('users', [])}
def auth_user(email):
    if email in existing:
        return existing[email]
    r = gotrue('POST', '/admin/users', {'email': email, 'password': password, 'email_confirm': True})
    assert 'id' in r, r
    return r['id']

ORG_A, ORG_B = uid('org', 'A'), uid('org', 'B')
# key, org, display name, reps.role, org role, team, team role
PEOPLE = [
    ('owner',   ORG_A, 'Olive Owner',    'admin', 'OWNER',   None, None),
    ('admin',   ORG_A, 'Adam Admin',     'admin', 'ADMIN',   None, None),
    ('manager', ORG_A, 'Mara Manager',   'rep',   'MANAGER', 'east', 'MANAGER'),
    ('rep1',    ORG_A, 'Ava Rep',        'rep',   'MEMBER',  'east', 'MEMBER'),
    ('rep2',    ORG_A, 'Ben Rep',        'rep',   'MEMBER',  'east', 'MEMBER'),
    ('rep3',    ORG_A, 'Cara Rep',       'rep',   'MEMBER',  'west', 'MEMBER'),
    ('adminb',  ORG_B, 'Zed Admin',      'admin', 'ADMIN',   None, None),
    ('repb',    ORG_B, 'Yara Rep',       'rep',   'MEMBER',  None, None),
]
rep = {k: uid('rep', k) for k, *_ in PEOPLE}
auth = {k: auth_user(f'{k}@relay-synth.test') for k, *_ in PEOPLE}

sql = ['begin;']
def q(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, datetime):
        return "'" + v.isoformat() + "'"
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"
def ins(table, rows):
    if not rows:
        return
    cols = list(rows[0].keys())
    vals = ',\n  '.join('(' + ', '.join(q(r[c]) for c in cols) + ')' for r in rows)
    sql.append(f'insert into {table} ({", ".join(cols)}) values\n  {vals}\non conflict do nothing;')

ins('organizations', [{'id': ORG_A, 'name': 'Northwind (synthetic)'}, {'id': ORG_B, 'name': 'Contoso (synthetic)'}])
ins('reps', [{'id': rep[k], 'organization_id': o, 'auth_user_id': auth[k], 'name': n, 'role': r} for k, o, n, r, *_ in PEOPLE])
ins('voice_profiles', [{'rep_id': rep[k], 'organization_id': o, 'style_card': {'tone': 'direct', 'greeting': 'Hi', 'signOff': 'Best'},
                         'sample_source': 'pasted_samples', 'calibrated_at': NOW} for k, o, *_ in PEOPLE])
ins('organization_roles', [{'organization_id': o, 'person_id': rep[k], 'role': orole} for k, o, n, r, orole, *_ in PEOPLE])
TEAMS = {'east': uid('team', 'east'), 'west': uid('team', 'west')}
ins('teams', [{'id': TEAMS['east'], 'organization_id': ORG_A, 'name': 'Enterprise East'},
              {'id': TEAMS['west'], 'organization_id': ORG_A, 'name': 'SMB West'}])
ins('team_memberships', [{'team_id': TEAMS[t], 'person_id': rep[k], 'membership_role': tr}
                         for k, o, n, r, orole, t, tr in PEOPLE if t])
CAPS = {
    'OWNER': ['MANAGE_TEAM_MEMBERS', 'VIEW_TEAM_WORK', 'ASSIGN_TEAM_WORK', 'MANAGE_TEAM_TARGETS', 'VIEW_TEAM_ANALYTICS',
              'MANAGE_REVENUE_IDENTITIES', 'MANAGE_ORG_USERS', 'MANAGE_ORG_SETTINGS', 'ACCESS_REVENUE_INTELLIGENCE', 'ACCESS_RELAY_GROWTH'],
    'ADMIN': ['MANAGE_TEAM_MEMBERS', 'VIEW_TEAM_WORK', 'ASSIGN_TEAM_WORK', 'MANAGE_TEAM_TARGETS', 'VIEW_TEAM_ANALYTICS',
              'MANAGE_REVENUE_IDENTITIES', 'MANAGE_ORG_USERS', 'ACCESS_REVENUE_INTELLIGENCE', 'ACCESS_RELAY_GROWTH'],
    'MANAGER': ['VIEW_TEAM_WORK', 'ASSIGN_TEAM_WORK', 'VIEW_TEAM_ANALYTICS', 'MANAGE_TEAM_TARGETS'],
    'MEMBER': ['VIEW_OWN_WORK', 'EXECUTE_OWN_WORK'],
}
ins('capabilities', [{'organization_id': o, 'role': role, 'capability': c, 'granted': True}
                     for o in (ORG_A, ORG_B) for role, cs in CAPS.items() for c in cs])

IDENT = {'cloud': uid('ident', 'cloud'), 'data': uid('ident', 'data'), 'mobile': uid('ident', 'mobile'), 'b': uid('ident', 'b')}
# Sending LinkedIn profiles (profiles.id); each identity is built on one, as in production.
PROFILE = {k: uid('profile', k) for k in IDENT}
PROFILE_OWNER = {'cloud': 'rep1', 'data': 'rep2', 'mobile': 'rep3', 'b': 'repb'}
ins('profiles', [{'id': PROFILE[k], 'organization_id': ORG_B if k == 'b' else ORG_A, 'rep_id': rep[PROFILE_OWNER[k]],
                  'label': f'{k.title()} sender (synthetic)', 'full_name': f'{k.title()} Sender'} for k in IDENT])
ins('revenue_identities', [
    {'id': IDENT['cloud'], 'profile_id': PROFILE['cloud'], 'organization_id': ORG_A, 'slug': 'northwind-cloud', 'identity_name': 'Northwind Cloud', 'title': 'Cloud Practice Lead'},
    {'id': IDENT['data'], 'profile_id': PROFILE['data'], 'organization_id': ORG_A, 'slug': 'northwind-data', 'identity_name': 'Northwind Data', 'title': 'Data Engineering Lead'},
    {'id': IDENT['mobile'], 'profile_id': PROFILE['mobile'], 'organization_id': ORG_A, 'slug': 'northwind-mobile', 'identity_name': 'Northwind Mobile', 'title': 'Mobile Studio Lead'},
    {'id': IDENT['b'], 'profile_id': PROFILE['b'], 'organization_id': ORG_B, 'slug': 'contoso-main', 'identity_name': 'Contoso Main', 'title': 'Principal'},
])
OWN_IDENT = {'manager': 'cloud', 'rep1': 'cloud', 'rep2': 'data', 'rep3': 'mobile', 'repb': 'b', 'adminb': 'b'}
ins('identity_assignments', [{'organization_id': ORG_B if k in ('repb', 'adminb') else ORG_A, 'revenue_identity_id': IDENT[i], 'rep_id': rep[k],
                              'assigned_by': rep['adminb'] if k in ('repb', 'adminb') else rep['admin']} for k, i in OWN_IDENT.items()])
ins('daily_targets', [{'organization_id': ORG_A, 'rep_id': rep[k], 'revenue_identity_id': IDENT[OWN_IDENT[k]], 'activity_type': a, 'target_count': c, 'active': True}
                      for k in ('manager', 'rep1', 'rep2', 'rep3') for a, c in (('connection_request', 15), ('dm', 20), ('followup', 10), ('meeting', 1))])

# ── leads: one live lead per company (the unique index), extra contacts dead ──
SECTORS = ['Analytics', 'Logistics', 'Health', 'Retail', 'Fintech', 'Energy', 'Media', 'Robotics', 'Travel', 'Legal', 'Foods', 'Security']
WORDS = ['Blue', 'Cedar', 'Harbor', 'Summit', 'Quartz', 'Maple', 'Orbit', 'Lumen', 'Atlas', 'Pine']
FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Riley', 'Casey', 'Morgan', 'Jamie', 'Drew', 'Quinn', 'Avery', 'Reese']
LAST = ['Lee', 'Patel', 'Garcia', 'Nguyen', 'Kim', 'Brown', 'Silva', 'Khan', 'Novak', 'Ito']
TITLES = ['CTO', 'VP Engineering', 'Head of Data', 'Founder', 'Product Director', 'COO']
owners_a = ['rep1', 'rep2', 'rep3', 'manager']
STATUS_MIX = ['new'] * 5 + ['contacted'] * 6 + ['followed_up'] * 4 + ['replied'] * 4 + ['won'] * 1 + ['lost'] * 2
leads, convo, messages, events, tasks, task_events = [], [], [], [], [], []
live_leads = []
for i in range(60):
    company = f'{WORDS[i % 10]} {SECTORS[i % 12]} {i:02d} (synthetic)'
    owner = owners_a[i % 4]
    lid = uid('lead', i)
    status = STATUS_MIX[i % len(STATUS_MIX)]
    # Contacted leads: created 15-30 days ago so every step (≤ +9d) is ≥ 5 days old.
    created = NOW - timedelta(days=random.randint(1, 10) if status == 'new' else random.randint(15, 30), hours=random.randint(0, 20))
    leads.append({'id': lid, 'organization_id': ORG_A, 'owner_rep_id': rep[owner], 'company': company,
                  'contact_name': f'{FIRST[i % 12]} {LAST[i % 10]}', 'contact_title': TITLES[i % 6], 'status': status,
                  'source': 'linkedin', 'canonical_score': 40 + (i * 7) % 55, 'revenue_identity_id': IDENT[OWN_IDENT[owner]],
                  'created_at': created, 'is_test': False})
    live_leads.append((lid, owner, status, created))
    if i % 5 == 0:  # a second, dead contact at the same account
        leads.append({'id': uid('lead-dead', i), 'organization_id': ORG_A, 'owner_rep_id': rep[owner], 'company': company,
                      'contact_name': f'{FIRST[(i + 3) % 12]} {LAST[(i + 4) % 10]}', 'contact_title': 'Engineer', 'status': 'dead',
                      'source': 'linkedin', 'canonical_score': 20, 'revenue_identity_id': IDENT[OWN_IDENT[owner]],
                      'created_at': created, 'is_test': False})
for i in range(6):
    leads.append({'id': uid('lead-b', i), 'organization_id': ORG_B, 'owner_rep_id': rep['repb'], 'company': f'Fabrikam {i} (synthetic)',
                  'contact_name': f'Org B Contact {i}', 'contact_title': 'CEO', 'status': 'contacted', 'source': 'linkedin',
                  'canonical_score': 60, 'revenue_identity_id': IDENT['b'], 'created_at': NOW - timedelta(days=i + 1), 'is_test': False})
ins('leads', leads)

def ev(lead, owner, kind, at, status='sent', extra=None):
    events.append({'id': uid('ev', lead, kind, at.isoformat()), 'organization_id': ORG_A, 'actor_type': 'rep', 'actor_id': rep[owner],
                   'sender_profile_id': PROFILE[OWN_IDENT[owner]], 'lead_id': lead, 'action_type': kind, 'execution_status': status,
                   'channel': 'linkedin', 'metadata': extra or {}, 'occurred_at': at, 'idempotency_key': uid('idem', lead, kind, at.isoformat())})

STAGE = {'new': 'new', 'contacted': 'contacted', 'followed_up': 'contacted', 'replied': 'replied', 'won': 'won', 'lost': 'lost'}
for n, (lid, owner, status, created) in enumerate(live_leads):
    if status == 'new':
        continue
    t0 = created + timedelta(days=1)
    ev(lid, owner, 'CONNECTION_SENT', t0)
    messages.append({'id': uid('msg', lid, 0), 'organization_id': ORG_A, 'lead_id': lid, 'rep_id': rep[owner], 'type': 'dm', 'direction': 'outbound',
                     'sent_text': f'Hi — Northwind helps teams like yours ship faster. Open to a short call? (synthetic message {n})',
                     'sent_at': t0 + timedelta(hours=20), 'thread_status': 'VERIFIED', 'revenue_identity_id': IDENT[OWN_IDENT[owner]]})
    ev(lid, owner, 'DM_SENT', t0 + timedelta(hours=20))
    stage = STAGE[status]
    if status in ('followed_up', 'replied', 'won'):
        ev(lid, owner, 'FOLLOWUP_SENT', t0 + timedelta(days=3))
    if status in ('replied', 'won'):
        body = ('Thanks for reaching out — yes, Thursday works. ' + 'We are evaluating vendors this quarter. ' * 40) if n % 3 == 0 else 'Sounds good, send times.'
        messages.append({'id': uid('msg', lid, 1), 'organization_id': ORG_A, 'lead_id': lid, 'rep_id': rep[owner], 'type': 'reply', 'direction': 'inbound',
                         'sent_text': body, 'sent_at': t0 + timedelta(days=4), 'thread_status': 'VERIFIED', 'revenue_identity_id': IDENT[OWN_IDENT[owner]]})
        ev(lid, owner, 'REPLY_RECEIVED', t0 + timedelta(days=4))
        ev(lid, owner, 'REPLY_SENT', t0 + timedelta(days=4, hours=2))
        if n % 2 == 0:
            ev(lid, owner, 'MEETING_BOOKED', t0 + timedelta(days=5))
            stage = 'meeting'
    if status == 'won':
        ev(lid, owner, 'CLIENT_WON', t0 + timedelta(days=9))
    convo.append({'organization_id': ORG_A, 'lead_id': lid, 'stage': stage, 'sender_profile_id': PROFILE[OWN_IDENT[owner]],
                  'last_sent_at': t0 + timedelta(hours=20)})
# today's work, so Home / Reports / Targets have a live day
for k, owner in enumerate(['rep1', 'rep1', 'rep1', 'rep2', 'rep2', 'rep3', 'manager']):
    lid = live_leads[k * 3][0]
    ev(lid, owner, 'CONNECTION_SENT', NOW - timedelta(minutes=30 + k * 7))
    ev(lid, owner, 'DM_SENT', NOW - timedelta(minutes=20 + k * 5))
ev(live_leads[1][0], 'rep2', 'DM_SENT', NOW - timedelta(minutes=12), status='failed')  # never counts
ins('conversation_states', convo)
ins('messages', messages)
ins('action_events', events)

# ── tasks: manager → team, admin → anyone; some overdue ──
TASK_SPECS = [
    ('manager', 'rep1', 'CALL', 'Call the Harbor Analytics champion', 'HIGH', -1, 'OPEN'),
    ('manager', 'rep1', 'PREPARE_PROPOSAL', 'Draft proposal for Summit Retail', 'CRITICAL', 2, 'IN_PROGRESS'),
    ('manager', 'rep2', 'RESEARCH', 'Research Quartz Fintech stakeholders', 'NORMAL', 1, 'OPEN'),
    ('manager', 'rep2', 'REVIEW', 'Review follow-up copy', 'LOW', -3, 'OPEN'),
    ('admin', 'rep3', 'CUSTOM', 'Clean up stale SMB leads', 'NORMAL', 4, 'OPEN'),
    ('admin', 'manager', 'REQUEST_UPDATE', 'Weekly pipeline update', 'NORMAL', 0, 'OPEN'),
    ('manager', 'rep1', 'CALL', 'Confirm Thursday meeting', 'HIGH', -2, 'DONE'),
    ('admin', 'rep2', 'ADMIN', 'Update CRM fields', 'LOW', 5, 'CANCELLED'),
]
for n, (by, to, kind, title, prio, due_days, status) in enumerate(TASK_SPECS):
    tid = uid('task', n)
    tasks.append({'id': tid, 'organization_id': ORG_A, 'assignee_rep_id': rep[to], 'created_by_rep_id': rep[by], 'lead_id': live_leads[n * 2][0],
                  'kind': kind, 'title': title + ' (synthetic)', 'priority': prio, 'due_at': NOW + timedelta(days=due_days, hours=-3),
                  'status': status, 'completed_at': NOW - timedelta(hours=5) if status == 'DONE' else None,
                  'cancelled_at': NOW - timedelta(hours=6) if status == 'CANCELLED' else None})
    task_events.append({'organization_id': ORG_A, 'task_id': tid, 'event_type': 'TASK_CREATED', 'actor_rep_id': rep[by], 'metadata': {}})
ins('assigned_tasks', tasks)
ins('task_events', task_events)

ins('notifications', [
    {'organization_id': ORG_A, 'recipient_id': rep['rep1'], 'notification_type': 'task_assigned', 'title': 'New task assigned',
     'body': 'Call the Harbor Analytics champion', 'link': '/tasks', 'dedupe_key': 'seed:task:rep1', 'read': False},
    {'organization_id': ORG_A, 'recipient_id': rep['rep1'], 'notification_type': 'reply', 'title': 'New reply',
     'body': 'Alex Lee replied', 'link': f'/leads/{live_leads[0][0]}', 'dedupe_key': 'seed:reply:rep1', 'read': False},
    {'organization_id': ORG_A, 'recipient_id': rep['rep2'], 'notification_type': 'task_overdue', 'title': 'Task overdue',
     'body': 'Review follow-up copy', 'link': '/tasks', 'dedupe_key': 'seed:overdue:rep2', 'read': False},
    {'organization_id': ORG_A, 'recipient_id': rep['manager'], 'notification_type': 'meeting_request', 'title': 'Meeting requested',
     'body': 'A prospect asked to meet', 'link': '/chats', 'dedupe_key': 'seed:meeting:mgr', 'read': True},
    {'organization_id': ORG_B, 'recipient_id': rep['repb'], 'notification_type': 'reply', 'title': 'New reply (org B)',
     'body': 'Org B only', 'link': '/notifications', 'dedupe_key': 'seed:b', 'read': False},
])
sql.append('commit;')

# Ground truth, computed here from the seed rows (independent of app code).
def today(e):
    return e['occurred_at'] >= NOW.replace(hour=0, minute=0, second=0)
truth = {'today': {}, 'leads_live_by_owner': {}, 'companies_org_a': 60, 'unread': {}, 'open_overdue': {}}
for k in ('manager', 'rep1', 'rep2', 'rep3'):
    mine = [e for e in events if e['actor_id'] == rep[k] and e['execution_status'] != 'failed']
    truth['today'][k] = {'connections': sum(1 for e in mine if today(e) and e['action_type'] == 'CONNECTION_SENT'),
                         'messages': sum(1 for e in mine if today(e) and e['action_type'] in ('DM_SENT', 'FOLLOWUP_SENT', 'REPLY_SENT'))}
    truth['leads_live_by_owner'][k] = sum(1 for l in leads if l['owner_rep_id'] == rep[k] and l['status'] != 'dead')
truth['future_events'] = sum(1 for e in events if e['occurred_at'] > NOW)
truth['long_inbound_chars'] = max(len(m['sent_text']) for m in messages)
json.dump(truth, open(os.path.join(stack, 'truth.json'), 'w'), indent=1, default=str)

out = os.path.join(stack, 'seed.sql')
open(out, 'w').write('\n'.join(sql) + '\n')
r = subprocess.run(['docker', 'exec', '-i', '-e', 'PGPASSWORD=postgres', 'supabase_db_relay-p8-synth', 'psql', '-U', 'supabase_admin',
                    '-h', '127.0.0.1', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
                   input=open(out).read(), capture_output=True, text=True)
print('seed exit', r.returncode, (r.stderr or '')[-600:])
json.dump({k: {'email': f'{k}@relay-synth.test', 'rep_id': rep[k]} for k in rep}, open(os.path.join(stack, 'cast.json'), 'w'), indent=1)
print(f'users {len(auth)}, leads {len(leads)}, messages {len(messages)}, events {len(events)}, tasks {len(tasks)}')
