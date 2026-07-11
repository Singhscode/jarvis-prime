# Quick Start: Migration to Production Structure

**TL;DR Version** - Start here if you just want the essentials.

## In 5 Minutes

1. Read `PRODUCTION_STRUCTURE.md` folder tree
2. You now understand the target layout
3. See `MIGRATION_GUIDE.md` for how to get there

## Your Choice

### Option A: I want to understand first
→ Read `PRODUCTION_STRUCTURE.md` (20 minutes)

### Option B: I want to plan a migration  
→ Follow `MIGRATION_GUIDE.md` phases 1-5 (safe, reversible)

### Option C: I want to know about configuration
→ Read `config/README.md` and copy `config/.env.example` to `.env.local`

### Option D: I want to understand the build system
→ Read `TURBO_CONFIG_GUIDE.md` (explains turbo.json)

### Option E: I'm ready to migrate NOW
→ Follow this checklist:

## Quick Migration Checklist

```bash
# 1. BACKUP (do this first!)
git status  # Make sure everything is committed
git branch  # You're on main? Create feature branch:
git checkout -b feat/migrate-to-production-structure

# 2. CREATE DIRECTORIES (Phase 1)
mkdir -p apps/web packages/{ui,shared} services/{api,workers,webhooks}
mkdir -p infrastructure/{docker,kubernetes,terraform,scripts}
mkdir -p docs/{architecture,api,deployment} tools/scripts config tests/{e2e,integration}

# 3. COPY CONFIGS (Phase 1.5)
cp apps/public apps/web/ -r 2>/dev/null || true
cp apps/package.json apps/web/ 2>/dev/null || true
cp apps/next.config.mjs apps/web/ 2>/dev/null || true
# ... (copy more app files)

# 4. CONSOLIDATE CONFIGS (Phase 2)
cp config/.env.example .env.local
# Edit .env.local with your values

# 5. UPDATE ROOT FILES (Phase 2)
cp turbo.production.json turbo.json
cp .gitignore.production .gitignore

# 6. TEST
npm install
npm run type-check
npm run lint
npm run build

# 7. COMMIT
git add .
git commit -m "chore: migrate to production structure"

# 8. VERIFY AGAIN
npm run test

# 9. PUSH
git push -u origin feat/migrate-to-production-structure

# 10. REVIEW & MERGE
# Create PR for team review before merging
```

## What Each File Does

| File | What It Is | What To Do |
|------|-----------|-----------|
| `PRODUCTION_STRUCTURE.md` | Architecture blueprint | Read for understanding |
| `MIGRATION_GUIDE.md` | Step-by-step guide | Follow the phases |
| `TURBO_CONFIG_GUIDE.md` | Build system docs | Reference when needed |
| `.gitignore.production` | Git ignore rules | Copy to `.gitignore` |
| `turbo.production.json` | Build configuration | Copy to `turbo.json` |
| `config/.env.example` | Environment template | Copy to `.env.local` |

## The Three Hardest Parts

### 1. Updating Import Paths
**Old**: `import Button from "@/components/button"`  
**New**: `import { Button } from "@jarvis/ui/components"`

**How to do it**:
```bash
# Find all imports
grep -r "from ['\"]@/" apps/web/src --include="*.ts"

# Update them systematically
# Use find-replace in your editor
# Or write a script
```

### 2. Moving Files Without Breaking Things
**Solution**: Don't move all at once. Do it per-component, test after each move.

### 3. Circular Dependencies
**Solution**: Turbo will warn you. Refactor one package at a time to break cycles.

## Testing Checkpoints

After each phase, run:

```bash
# After directories created
npm install

# After configs updated  
npm run type-check

# After imports updated
npm run lint

# After everything
npm run build && npm run test
```

## If Something Breaks

### Option 1: Small fix
```bash
# Fix the issue
# Recommit: git add . && git commit -m "fix: ..."
```

### Option 2: Revert one phase
```bash
git revert HEAD~1
```

### Option 3: Complete rollback
```bash
git reset --hard origin/main
git clean -fd
```

## FAQ

**Q: How long does this take?**  
A: 8-16 hours spread over 3-5 days for a full migration.

**Q: Can I do it incrementally?**  
A: Yes! Do phases 1-5, get review, then do phase 6-8.

**Q: What if my team is distributed?**  
A: That's fine. Just make sure everyone knows before you push breaking changes.

**Q: Do I need to follow this exactly?**  
A: No. Adapt to your needs. But keep the core principles.

**Q: What's the worst that could happen?**  
A: Import paths break. Solution: git reset and try again.

## Pro Tips

1. **Do one phase at a time** - Easier to debug if something breaks
2. **Test after each phase** - Don't wait until the end
3. **Commit frequently** - Easier to rollback individual changes
4. **Use feature branch** - Don't commit to main until team approves
5. **Document your changes** - Update README when paths change

## Next Action

Choose one:

- 🎯 **I'm ready**: Go to `MIGRATION_GUIDE.md` and start Phase 1
- 📚 **I need to learn**: Read `PRODUCTION_STRUCTURE.md` first
- 🏗️ **I need to plan**: Gather your team and review the guides together
- ⚙️ **I want config help**: Check `config/README.md`

---

**Remember**: This is reversible. You have git. You have a backup. You're good! 

Let's do this! 🚀
