# Student Attendance Backend Data Model

## Overview
This schema targets a MySQL 8.x deployment for a student attendance and notification backend. It is normalized to reduce duplication while keeping read-paths (attendance dashboards, per-student subject views, notifications) efficient via composite indexes.

```
Schools 1─∞ Grades 1─∞ Sections 1─∞ Classrooms
Students ∞─1 Classrooms
Teachers 1─∞ Students (homerooms via classTeacherId)
Teachers ∞─∞ Subjects (via teacher_subjects)
Students ∞─∞ Subjects (via student_subjects -> teacher_subjects)
Subjects 1─∞ Exams 1─∞ StudentExamResults
StudentGroups 1─∞ StudentGroupMembers
AttendanceSessions 1─∞ StudentAttendance
Notifications ∞─∞ Recipients (students, student_groups, teachers, classrooms) via notification_targets
```

## Core Reference Tables

### `schools`
| Column         | Type         | Notes                                    |
|----------------|--------------|------------------------------------------|
| `id`           | BIGINT PK    | natural or surrogate school identifier    |
| `name`         | VARCHAR(120) | unique per tenant                         |
| `district`     | VARCHAR(120) | optional                                  |
| `is_active`    | TINYINT(1)   | default 1                                 |
| `created_at`   | DATETIME     | default CURRENT_TIMESTAMP                 |

### `grades`
| Column         | Type         | Notes                                      |
|----------------|--------------|--------------------------------------------|
| `id`           | BIGINT PK    |                                           |
| `school_id`    | BIGINT FK    | -> `schools.id`                            |
| `name`         | VARCHAR(30)  | e.g. "Grade 8"                             |
| `level`        | TINYINT      | numeric ordering                           |
| `is_active`    | TINYINT(1)   |                                           |

### `sections`
| Column         | Type         | Notes                                      |
|----------------|--------------|--------------------------------------------|
| `id`           | BIGINT PK    |                                           |
| `grade_id`     | BIGINT FK    | -> `grades.id`                             |
| `label`        | VARCHAR(10)  | e.g. "A"                                   |

### `classrooms`
Represents a unique grade+section within a school-year.

| Column         | Type         | Notes                                      |
|----------------|--------------|--------------------------------------------|
| `id`           | BIGINT PK    |                                           |
| `school_id`    | BIGINT FK    | -> `schools.id`                            |
| `grade_id`     | BIGINT FK    | -> `grades.id`                             |
| `section_id`   | BIGINT FK    | -> `sections.id`                           |
| `academic_year`| CHAR(9)      | e.g. "2025-2026"                           |
| Unique Index   | (`grade_id`,`section_id`,`academic_year`)                  |

## People & Subjects

### `students`
| Column         | Type          | Notes                                              |
|----------------|---------------|----------------------------------------------------|
| `id`           | BIGINT PK     | Student ID (external ID could be stored in `code`) |
| `school_id`    | BIGINT FK     | -> `schools.id`                                    |
| `classroom_id` | BIGINT FK     | -> `classrooms.id`                                 |
| `code`         | VARCHAR(30)   | human readable ID, unique per school               |
| `phone_number` | VARCHAR(15)   | optional unique phone, enables per-student lookups  |
| `class_teacher_id` | BIGINT FK | -> `teachers.id`, homeroom owner, nullable |
| `first_name`   | VARCHAR(60)   |                                                    |
| `last_name`    | VARCHAR(60)   |                                                    |
| `grade_level`  | TINYINT       | cached for quick reads                             |
| `section_label`| VARCHAR(10)   | cached                                              |
| `enrolled_at`  | DATE          |                                                    |
| `active`       | TINYINT(1)    |                                                    |
| Indexes        | (`school_id`,`classroom_id`), (`code`,`school_id`)                  |
| Unique         | (`phone_number`) (nullable)                                         |

### `teachers`
| Column       | Type        | Notes                         |
|--------------|-------------|-------------------------------|
| `id`         | BIGINT PK   |                              |
| `school_id`  | BIGINT FK   | -> `schools.id`               |
| `first_name` | VARCHAR(60) |                              |
| `last_name`  | VARCHAR(60) |                              |
| `email`      | VARCHAR(120)| unique                         |
| `active`     | TINYINT(1)  |                              |

### `users`
| Column        | Type         | Notes                                                      |
|---------------|--------------|------------------------------------------------------------|
| `id`          | BIGINT PK    |                                                            |
| `school_id`   | BIGINT FK    | nullable for government-level accounts                     |
| `email`       | VARCHAR(120) | unique login                                                |
| `phone_number`| VARCHAR(15)  | optional unique contact                                     |
| `password_hash`| VARCHAR(255)| bcrypt hash                                                 |
| `role`        | ENUM         | ('STUDENT','TEACHER','GOVERNMENT','PRINCIPAL','ADMIN')      |
| `status`      | ENUM         | ('active','blocked')                                       |
| `student_id`  | BIGINT FK    | optional pointer to `students.id`                          |
| `teacher_id`  | BIGINT FK    | optional pointer to `teachers.id`                          |
| `created_at`  | DATETIME     | default CURRENT_TIMESTAMP                                  |
| `updated_at`  | DATETIME     | auto-updated                                               |
| Indexes       | (`role`), unique (`email`), unique (`phone_number`)                        |

### `subjects`
| Column      | Type        | Notes                                 |
|-------------|-------------|---------------------------------------|
| `id`        | BIGINT PK   |                                       |
| `school_id` | BIGINT FK   | -> `schools.id`                        |
| `code`      | VARCHAR(20) | e.g. "MATH8"                           |
| `name`      | VARCHAR(80) |                                       |
| Unique      | (`school_id`,`code`)                                 |

### `teacher_subjects`
Defines which teacher handles a subject for a classroom/grade.

| Column         | Type        | Notes                                              |
|----------------|-------------|----------------------------------------------------|
| `id`           | BIGINT PK   |                                                    |
| `teacher_id`   | BIGINT FK   | -> `teachers.id`                                   |
| `subject_id`   | BIGINT FK   | -> `subjects.id`                                   |
| `classroom_id` | BIGINT FK   | -> `classrooms.id` (nullable for school-wide)      |
| `start_date`   | DATE        | instructional period start                         |
| `end_date`     | DATE        | nullable                                           |
| Unique         | (`teacher_id`,`subject_id`,`classroom_id`,`start_date`)           |

### `student_subjects`
Captures the "list of subjects" per student along with the responsible teacher.

| Column             | Type        | Notes                                                    |
|--------------------|-------------|----------------------------------------------------------|
| `id`               | BIGINT PK   |                                                          |
| `student_id`       | BIGINT FK   | -> `students.id`                                         |
| `teacher_subject_id`| BIGINT FK  | -> `teacher_subjects.id`                                 |
| `enrolled_on`      | DATE        |                                                          |
| `status`           | ENUM        | ('active','dropped','completed')                         |
| Unique             | (`student_id`,`teacher_subject_id`)                                    |

### `student_groups`
Reusable sets of students (clubs, bus routes, remediation batches) for notifications or reporting.

| Column        | Type        | Notes                                             |
|---------------|-------------|---------------------------------------------------|
| `id`          | BIGINT PK   |                                                   |
| `school_id`   | BIGINT FK   | -> `schools.id`                                   |
| `name`        | VARCHAR(80) | unique per school                                 |
| `description` | TEXT        | optional                                          |
| `visibility`  | ENUM        | ('manual','rule_based') to support automation     |
| `active`      | TINYINT(1)  |                                                   |
| Unique        | (`school_id`,`name`)                                             |

### `student_group_members`

| Column        | Type        | Notes                                             |
|---------------|-------------|---------------------------------------------------|
| `id`          | BIGINT PK   |                                                   |
| `group_id`    | BIGINT FK   | -> `student_groups.id`                            |
| `student_id`  | BIGINT FK   | -> `students.id`                                  |
| `added_at`    | DATETIME    | default CURRENT_TIMESTAMP                         |
| `added_by`    | BIGINT FK   | -> `teachers.id` or admin users                   |
| Unique        | (`group_id`,`student_id`)                                        |

## Scheduling

### `classroom_timetables`
Represents the canonical weekly timetable per classroom (grade-section) and period.

| Column             | Type        | Notes                                                             |
|--------------------|-------------|-------------------------------------------------------------------|
| `id`               | BIGINT PK   |                                                                   |
| `school_id`        | BIGINT FK   | -> `schools.id`                                                   |
| `classroom_id`     | BIGINT FK   | -> `classrooms.id`                                                |
| `week_day`         | TINYINT     | 1-7 (ISO weekday)                                                 |
| `period`           | TINYINT     | sequential slot number                                            |
| `start_time`       | TIME        | optional                                                           |
| `end_time`         | TIME        | optional                                                           |
| `label`            | VARCHAR(80) | Display name shown to portals                                     |
| `location`         | VARCHAR(80) | optional room or block                                            |
| `notes`            | VARCHAR(255)| optional metadata                                                 |
| `teacher_subject_id`| BIGINT FK  | -> `teacher_subjects.id`, nullable for advisory/break slots        |
| Unique             | (`classroom_id`,`week_day`,`period`) to prevent overlapping slots               |
| Indexes            | (`school_id`,`classroom_id`,`week_day`) for fast weekly lookups                 |

## Exams & Grades

### `exams`
| Column         | Type        | Notes                                            |
|----------------|-------------|--------------------------------------------------|
| `id`           | BIGINT PK   |                                                  |
| `subject_id`   | BIGINT FK   | -> `subjects.id`                                 |
| `teacher_id`   | BIGINT FK   | -> `teachers.id`                                 |
| `classroom_id` | BIGINT FK   | nullable for school-wide exams                   |
| `name`         | VARCHAR(80) | e.g. "Midterm"                                   |
| `total_marks`  | DECIMAL(5,2)|                                                  |
| `exam_date`    | DATE        |                                                  |
| Indexes        | (`subject_id`,`exam_date`), (`classroom_id`,`exam_date`)       |

### `student_exam_results`
| Column        | Type         | Notes                                        |
|---------------|--------------|----------------------------------------------|
| `id`          | BIGINT PK    |                                              |
| `exam_id`     | BIGINT FK    | -> `exams.id`                                |
| `student_id`  | BIGINT FK    | -> `students.id`                             |
| `score`       | DECIMAL(5,2) |                                              |
| `grade`       | VARCHAR(5)   | e.g. "A+"                                    |
| `graded_at`   | DATETIME     |                                              |
| Unique        | (`exam_id`,`student_id`)                                     |

## Attendance

### `attendance_sessions`
Represents a roll call window (daily homeroom session per classroom).

| Column         | Type        | Notes                                                |
|----------------|-------------|------------------------------------------------------|
| `id`           | BIGINT PK   |                                                      |
| `school_id`    | BIGINT FK   | -> `schools.id`                                      |
| `classroom_id` | BIGINT FK   | -> `classrooms.id`                                   |
| `session_date` | DATE        |                                                      |
| `starts_at`    | TIME        | optional                                             |
| `ends_at`      | TIME        | optional                                             |
| Unique         | (`classroom_id`,`session_date`)                                     |

### `student_attendance`
| Column         | Type        | Notes                                       |
|----------------|-------------|---------------------------------------------|
| `id`           | BIGINT PK   |                                             |
| `attendance_session_id` | BIGINT FK | -> `attendance_sessions.id`           |
| `student_id`   | BIGINT FK   | -> `students.id`                            |
| `status`       | ENUM        | ('present','absent','late','excused')       |
| `recorded_at`  | DATETIME    | default CURRENT_TIMESTAMP                   |
| Unique         | (`attendance_session_id`,`student_id`)                    |

*To answer "which student was present on what day", query `student_attendance` filtered by `status='present'` joined to `attendance_sessions` by date.*

## Notification System

### `notifications`
| Column        | Type        | Notes                                              |
|---------------|-------------|----------------------------------------------------|
| `id`          | BIGINT PK   |                                                    |
| `school_id`   | BIGINT FK   | -> `schools.id`                                    |
| `title`       | VARCHAR(120)|                                                    |
| `body`        | TEXT        |                                                    |
| `category`    | ENUM        | ('general','exam','attendance','emergency')        |
| `active_from` | DATETIME    | default CURRENT_TIMESTAMP                          |
| `active_till` | DATETIME    | required per requirement                           |
| `priority`    | TINYINT     | 1=low, 5=critical                                  |
| `created_by`  | BIGINT FK   | -> `teachers.id` or staff user table               |
| Indexes       | (`school_id`,`active_from`,`active_till`), (`active_till`)        |

### `notification_targets`
Allows targeting specific students, pre-defined student sets, teachers, or entire classrooms.

| Column             | Type        | Notes                                                |
|--------------------|-------------|------------------------------------------------------|
| `id`               | BIGINT PK   |                                                      |
| `notification_id`  | BIGINT FK   | -> `notifications.id`                                |
| `target_type`      | ENUM        | ('student','student_group','teacher','classroom')    |
| `target_id`        | BIGINT      | references the respective entity ID                  |
| Unique             | (`notification_id`,`target_type`,`target_id`)                      |

**API usage note:** when the notification API receives an ad-hoc array of `studentId`s, simply loop and insert one `notification_targets` row per student using `target_type='student'`. For large batches, perform a bulk insert inside the same transaction as the parent `notifications` row so sends stay atomic. The student-group tables remain handy for reusable cohorts, but direct arrays let you push one-off selections without persisting an intermediate group.

### `notification_reads`
Optional helper table to track acknowledgement.

| Column            | Type        | Notes                                        |
|-------------------|-------------|----------------------------------------------|
| `id`              | BIGINT PK   |                                              |
| `notification_id` | BIGINT FK   | -> `notifications.id`                         |
| `user_type`       | ENUM        | ('student','teacher')                         |
| `user_id`         | BIGINT      |                                              |
| `read_at`         | DATETIME    | default CURRENT_TIMESTAMP                     |

## Sample Creation Snippet

```sql
CREATE TABLE students (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    school_id BIGINT NOT NULL,
    classroom_id BIGINT NOT NULL,
    code VARCHAR(30) NOT NULL,
    first_name VARCHAR(60) NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    grade_level TINYINT NOT NULL,
    section_label VARCHAR(10) NOT NULL,
    enrolled_at DATE NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY uq_student_code_school (school_id, code),
    KEY idx_student_classroom (school_id, classroom_id),
    CONSTRAINT fk_student_school FOREIGN KEY (school_id) REFERENCES schools(id),
    CONSTRAINT fk_student_classroom FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
);
```

## Indexing & Optimization Notes
- Partition `student_attendance` by `school_id` or `session_date` if daily volumes are high.
- Use covering indexes on (`student_id`,`session_date`) via a generated column in `student_attendance` or materialized view for fast present/absent lookups.
- Cache computed aggregates (attendance rate, latest exam score) in reporting tables if dashboards need sub-second responses.
- Prefer `ENUM` for status-like columns to keep storage small and enforce allowed states.

## Next Steps for API Work
1. Generate Sequelize/Prisma models (or Knex migrations) mirroring the tables above.
2. Implement service-layer repositories for attendance, exams, and notifications.
3. Add seed scripts for reference data (schools, grades, sections, subjects).
4. Expose REST/GraphQL endpoints once schema is validated.
