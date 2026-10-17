# People & Access

All staff sign in at `/login`. Public self-registration is disabled.

## Add a person

1. Open **People & Access → Add person** with `access.manage`.
2. Enter name, email, initial password, organizational department and primary facility scope.
3. Select roles. **Sales / Marketing** uses SALES; **PPIC / Planner** uses PLANNER. The combined active roles determine the sidebar preview.
4. For TECHNICIAN, create a profile with an employee/operator code and optional working calendar, or choose an existing unlinked active technician. Account and new profile are saved atomically; existing credentials are never reset by this flow.
5. Choose **Automatic** starting page or an allowed menu page, then save. New people open directly into their detail page.
6. Resource managers assess skills and record certificates under **Skills & certifications**. Planning/resource managers publish shifts, leave or training under **Availability**.
7. Use **Assigned work → Plan & assign work** to allocate an eligible production task in Planning. A calendar, roster shift, or technician role alone does not assign a task.

A technician profile can also be created first under **Technicians → Add technician**. Its **Account & access** tab opens account creation with the profile preselected.

## Person detail

- **Account & access**: login identity, roles, organization department, scope explanation, starting page and actual permission-derived menu preview.
- **Skills & certifications**: assessed levels, verification state, validity dates and expired evidence. Qualification types are maintained in **Skills & certifications**, including certification create/edit/archive.
- **Availability**: recurring calendar pattern and exceptions, plus published roster intervals for a chosen date range. Times for published intervals display in the browser timezone, labeled on screen. Calendar pattern retains its own configured timezone.
- **Assigned work**: confirmed bookings within the selected period and a separately labeled list of all open assigned tasks. Lists are bounded to 100 records per section, with an explicit truncation warning.

Only technicians have production qualifications, roster and assigned production tasks. Non-technician accounts show this distinction instead of fabricated schedule data.

## Starting pages

| Role | Automatic page |
| --- | --- |
| Owner | Dashboard |
| PPIC / Planner | Planning |
| QC | Quality Control |
| Sales / Marketing | Order Hub |
| Engineering | Engineering Hub |
| Warehouse | Inventory |
| Purchasing | Supply Orders |
| Technician | My Work |
| Customer | Customer Portal |
| Access Admin | People & Access |

With multiple roles, an explicitly selected authorized starting page wins. Automatic follows the priority shown above. If permissions later change, an inaccessible preference is ignored and an authorized destination is chosen. Menu visibility previews use the same navigation functions as the sidebar; they do not bypass API authorization.

## Organization and scope

Department is organizational metadata, scoped to the same workspace. It does **not** enforce department-only data visibility. Authorization remains explicit through permissions, granted facilities, linked customer scope and assigned-technician rules. Customer-scoped accounts may only use CUSTOMER. Adding roles combines permissions and may legitimately broaden access; review the preview before saving.

Changing the primary facility does not erase additional existing facility grants. Administrators can select only facilities within their own grants. Technician profile evidence and roster actions enforce workspace/facility scope. Working availability cannot be cancelled while it overlaps confirmed bookings; replan first. Publishing leave/training does not automatically move existing bookings.

This flow does not send invitation emails. Initial credentials are set by the authorized administrator and shared through the organization’s approved channel.
