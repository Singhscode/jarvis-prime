import os

base = '/home/kabeer/Documents/jarvis-prime/apps/api/src'

one_deep = {
    "from '../config.js'": "from '../config/config.js'",
    "from '../lib/logger.js'": "from '../utils/logger.js'",
    "from '../lib/db.js'": "from '../database/db.js'",
    "from '../lib/ab-testing.js'": "from '../utils/ab-testing.js'",
    "from '../lib/notifications.js'": "from '../integrations/notifications.js'",
    "from '../lib/scheduler.js'": "from '../jobs/scheduler.js'",
    "from '../providers/email/index.js'": "from '../ai/providers/email/index.js'",
    "from '../providers/ai/index.js'": "from '../ai/providers/ai/index.js'",
    "from '../providers/source/index.js'": "from '../ai/providers/source/index.js'",
    "from '../auth/jwt-service.js'": "from '../modules/auth/jwt-service.js'",
    "from '../auth/auth-service.js'": "from '../modules/auth/auth-service.js'",
    "from '../auth/constants.js'": "from '../modules/auth/constants.js'",
    "from '../email/sender.js'": "from '../integrations/email-sender.js'",
}

two_deep = {
    "from '../config.js'": "from '../../config/config.js'",
    "from '../lib/logger.js'": "from '../../utils/logger.js'",
    "from '../lib/db.js'": "from '../../database/db.js'",
    "from '../lib/ab-testing.js'": "from '../../utils/ab-testing.js'",
    "from '../lib/notifications.js'": "from '../../integrations/notifications.js'",
    "from '../lib/scheduler.js'": "from '../../jobs/scheduler.js'",
    "from '../email/sender.js'": "from '../../integrations/email-sender.js'",
    "from '../sources/prospect-finder.js'": "from '../../modules/prospects/prospect-finder.js'",
    "from '../scoring/icp-scorer.js'": "from '../../modules/prospects/icp-scorer.js'",
    "from '../providers/ai/index.js'": "from '../../ai/providers/ai/index.js'",
    "from '../providers/email/index.js'": "from '../../ai/providers/email/index.js'",
    "from '../providers/source/index.js'": "from '../../ai/providers/source/index.js'",
    "from '../auth/jwt-service.js'": "from '../../modules/auth/jwt-service.js'",
    "from '../auth/auth-service.js'": "from '../../modules/auth/auth-service.js'",
    "from '../auth/constants.js'": "from '../../modules/auth/constants.js'",
}

def fix_file(filepath, replacements):
    with open(filepath, 'r') as f:
        content = f.read()
    original = content
    for old, new in replacements.items():
        content = content.replace(old, new)
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print('  fixed: ' + os.path.relpath(filepath, base))
    else:
        print('  clean: ' + os.path.relpath(filepath, base))

for root, dirs, files in os.walk(base):
    dirs[:] = [d for d in dirs if d != 'node_modules']
    for fname in files:
        if not fname.endswith('.js'):
            continue
        fpath = os.path.join(root, fname)
        rel = os.path.relpath(fpath, base)
        depth = len(rel.split(os.sep)) - 1
        if depth == 1:
            fix_file(fpath, one_deep)
        elif depth == 2:
            fix_file(fpath, two_deep)

print('Done.')
