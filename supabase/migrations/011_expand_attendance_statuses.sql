-- Allow admins to record leave and non-work attendance states.
alter table attendance
  drop constraint if exists attendance_status_check;

alter table attendance
  add constraint attendance_status_check
  check (
    status in (
      'normal',
      'late',
      'early_leave',
      'absent',
      'annual_leave',
      'half_day',
      'outing',
      'sick_leave',
      'leave_of_absence',
      'holiday_work'
    )
  );
