-- Minimal database scope and atomic completion for the Employee Portal.

alter table public.users
  add column portal_owner_user_id uuid references public.users(id) on delete set null;

alter table public.crm_tasks
  add column assigned_user_id uuid references public.users(id) on delete set null;

create index crm_tasks_assigned_user_id_idx
  on public.crm_tasks (assigned_user_id);

create function public.complete_employee_portal_task(
  p_employee_user_id uuid,
  p_task_id uuid,
  p_completed boolean,
  p_justification text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  portal_owner_id uuid;
  task_row public.crm_tasks%rowtype;
  old_completed boolean;
begin
  if p_completed is null or p_justification is null
    or char_length(btrim(p_justification)) not between 1 and 1000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select u.portal_owner_user_id into portal_owner_id
  from public.users u
  where u.id = p_employee_user_id
    and u.role = 'employee'
    and u.status = 'active'
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS';
  end if;
  if portal_owner_id is null then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_SCOPE_MISSING';
  end if;

  select t.* into task_row
  from public.crm_tasks t
  where t.id = p_task_id
    and t.owner_user_id = portal_owner_id
    and t.assigned_user_id = p_employee_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'TASK_NOT_FOUND';
  end if;

  old_completed := task_row.completed;
  update public.crm_tasks
  set completed = p_completed
  where id = task_row.id
  returning * into task_row;

  insert into public.audit_logs (
    user_id, event_type, action, resource_type, resource_id, details
  ) values (
    p_employee_user_id,
    'employee_portal_task_completion',
    'update',
    'crm_task',
    task_row.id,
    jsonb_build_object(
      'justification', btrim(p_justification),
      'old_completed', old_completed,
      'new_completed', task_row.completed
    )
  );

  return jsonb_build_object(
    'id', task_row.id,
    'project_id', task_row.project_id,
    'name', task_row.name,
    'completed', task_row.completed
  );
end;
$$;

revoke all on function public.complete_employee_portal_task(uuid, uuid, boolean, text)
  from public;
grant execute on function public.complete_employee_portal_task(uuid, uuid, boolean, text)
  to service_role;