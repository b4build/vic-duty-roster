"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Users, Printer, Trash2, Plus, Search, Filter, X, ChevronDown, Clock, Building2, UserCircle2, User, AlertCircle, ClipboardList, DoorOpen, UserCheck, GripVertical, History, LayoutDashboard, TrendingUp, Share2, Copy, Check, Info } from 'lucide-react';
import facultyData from '@/lib/faculty-data.json';
import { Faculty, Room, InvigilatorSlot, DragItem, DutyAssignment, ShiftData } from '@/lib/types';
import { saveDutyAssignment, getDutyAssignmentByDate, updateDutyCounts, initializeFacultyData, getAllFaculty, getDutyHistoryByFaculty, getAllDutyAssignments, getAllDutyHistory, resetDutyCountsForDate, resetAllDutyCounts, exportBackupData, importBackupData, deleteDutyAssignment, clearAllDutyAssignments, replaceFacultyData, updateFacultyRecord, syncFacultyMetadataFromSeed } from '@/lib/db-utils';

type ViewMode = 'roster' | 'directory' | 'dashboard' | 'about';
type FacultySortBy = 'name' | 'department' | 'designation' | 'dutyCount' | 'fid' | 'shift';
type SortOrder = 'asc' | 'desc';
type BlobSyncStatus = {
  state: 'idle' | 'syncing' | 'synced' | 'error' | 'disabled';
  message: string;
  at?: string;
};
type BackupMeta = Partial<Record<BackupSection, string>>;
const DRAFT_KEY_PREFIX = 'vic_duty_draft_';
const BLOB_BACKUP_API = '/api/blob-backup';
type BackupSection = 'duties' | 'history' | 'faculty';
const BACKUP_META_KEY = 'vic_blob_backup_meta';
const WEEKDAY_OPTIONS = [
  { label: 'Monday', value: 'monday', short: 'Mon' },
  { label: 'Tuesday', value: 'tuesday', short: 'Tue' },
  { label: 'Wednesday', value: 'wednesday', short: 'Wed' },
  { label: 'Thursday', value: 'thursday', short: 'Thu' },
  { label: 'Friday', value: 'friday', short: 'Fri' },
  { label: 'Saturday', value: 'saturday', short: 'Sat' },
  { label: 'Sunday', value: 'sunday', short: 'Sun' }
] as const;
const WEEKDAY_ALIASES: Record<string, string> = {
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
  sun: 'sunday',
  sunday: 'sunday'
};

const parseFidDays = (value: string): string[] => {
  if (!value) return [];
  const parts = value
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(Boolean)
    .map(p => WEEKDAY_ALIASES[p] || p)
    .filter(p => WEEKDAY_OPTIONS.some(option => option.value === p));
  return Array.from(new Set(parts));
};

const formatFidDays = (days: string[]) =>
  days
    .map(day => WEEKDAY_OPTIONS.find(option => option.value === day)?.label || day)
    .join(', ');

const parseUnavailableDates = (value: string): string[] => {
  if (!value) return [];
  const parts = value
    .split(',')
    .map(p => p.trim())
    .filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p));
  return Array.from(new Set(parts)).sort();
};

const formatUnavailableDates = (dates: string[]) => Array.from(new Set(dates)).sort().join(', ');
const parseISODateLocal = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  // Noon avoids DST edge-case shifts around midnight.
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const formatISODateLocal = (
  value: string,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string => {
  const date = parseISODateLocal(value);
  if (!date) return value;
  return date.toLocaleDateString(locale, options);
};

const formatRosterHeadingDate = (value: string): string => {
  const date = parseISODateLocal(value);
  if (!date) return value;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  return `${dd}.${mm}.${yyyy} (${weekday})`;
};

const normalizeCurriculum = (value: string | undefined): 'CCF' | 'CBCS' => {
  const raw = (value || '').trim().toUpperCase();
  if (raw === 'CBCS' || raw === 'UNDER CBCS') return 'CBCS';
  return 'CCF';
};

const normalizeFacultyShift = (value: unknown): '' | 'Morning' | 'Day' => {
  if (typeof value !== 'string') return '';
  const raw = value.trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'morning' || raw === 'forenoon' || raw === 'am') return 'Morning';
  if (raw === 'day' || raw === 'afternoon' || raw === 'pm') return 'Day';
  return '';
};

const getFacultyShiftLabel = (faculty?: Faculty | null): '' | 'Morning' | 'Day' =>
  normalizeFacultyShift(faculty?.facultyShift);

const isMorningFaculty = (faculty?: Faculty | null): boolean =>
  getFacultyShiftLabel(faculty) === 'Morning';

const ABOUT_SECTIONS = {
  quickStart: [
    {
      step: 1,
      title: 'Choose Your Date & Exam Details',
      what: 'Select the examination date and configure exam context (Course, Semester, Year, Curriculum)',
      how: 'Navigate to Duty Roster → Pick date from calendar → Fill in course (e.g., B.A./B.Sc.), semester (e.g., SEM V), year, and curriculum type',
      why: 'This information appears on the printed roster header and helps organize your duty records chronologically'
    },
    {
      step: 2,
      title: 'Configure Shift Mode',
      what: 'Decide if you need Forenoon only, Afternoon only, or Both shifts',
      how: 'Click the shift mode dropdown → Select "Both", "Forenoon", or "Afternoon" based on exam schedule',
      why: 'This controls which supervisor fields and room sections appear, preventing confusion about which shifts need coverage'
    },
    {
      step: 3,
      title: 'Assign Shift Supervisors',
      what: 'Designate the overall supervisor for each active shift',
      how: 'Use the Supervisor dropdown for each active shift → Select from available faculty → The system auto-filters faculty based on their FID days and unavailable dates',
      why: 'Supervisors are accountable for the entire shift, so they should be assigned before distributing room-level responsibilities'
    },
    {
      step: 4,
      title: 'Create Room Blocks',
      what: 'Define examination rooms with student count and required invigilators',
      how: 'Click "+ Add Room" → Enter room number → Input student count → Specify how many invigilators needed (typically 1-2 per room) → Repeat for each room',
      why: 'This creates the structure before you fill slots, making it clear how many faculty members you need to assign'
    },
    {
      step: 5,
      title: 'Assign Invigilators to Rooms',
      what: 'Fill each invigilator slot with available faculty members',
      how: 'Desktop: Drag faculty names from the Available Faculty panel and drop into room slots. Mobile/Tablet: Click a slot → Select from dropdown → The system shows only available faculty (filtering out those on FID leave or marked unavailable for that date)',
      why: 'This is the core duty allocation step where you distribute examination responsibilities fairly across available staff'
    },
    {
      step: 6,
      title: 'Validate Completion',
      what: 'Verify all required slots are filled before saving',
      how: 'Check the Roster Summary panel → It shows Filled/Total counts for each shift → Look for any red/unfilled indicators → Review the Duty Count Preview to ensure fair distribution',
      why: 'Catching missing assignments now prevents printing incomplete rosters or having to reassign at the last minute'
    },
    {
      step: 7,
      title: 'Save and Generate Output',
      what: 'Persist your roster and create printable/shareable versions',
      how: 'Click "Save & Print" button → This saves to local storage and opens preview mode → From preview: Print directly (Ctrl+P), Download as PDF, Download as Word (.docx), or Share via system share sheet',
      why: 'Saving locks the duty assignment in the system, updates duty counts for fairness tracking, and enables professional output formats'
    },
  ],
  
  dutyRosterModule: {
    overview: 'The Duty Roster is your primary workspace for creating examination duty assignments. It handles date-specific rosters with intelligent faculty filtering and real-time validation.',
    
    features: [
      {
        name: 'Smart Date Selection',
        description: 'Choose any examination date from an integrated calendar picker. The system automatically loads any previously saved roster for that date, or starts fresh if it\'s a new assignment.',
        usage: 'Click the date field → Calendar opens → Select date → Previously saved data loads automatically (if exists)'
      },
      {
        name: 'Exam Context Configuration',
        description: 'Course, Semester, Year, and Curriculum fields provide essential context that appears on the printed roster header.',
        usage: 'Fill in text fields or use dropdowns (if pre-configured). Example: Course = "B.A. / B.Sc. / B.Com.", Semester = "SEM V", Year = "2025", Curriculum = "Under CCF"'
      },
      {
        name: 'Flexible Shift Management',
        description: 'Handle single-shift or dual-shift examination schedules. Each shift has its own supervisor and room set.',
        usage: 'Shift Mode dropdown offers: "Both" (default, shows forenoon + afternoon), "Forenoon" (morning only), "Afternoon" (afternoon only). Each shift allows custom time labels (e.g., "Morning 10 AM Onwards")'
      },
      {
        name: 'Availability-Aware Faculty Filtering',
        description: 'Faculty members appear in the Available Faculty list only if they meet two criteria: (1) The exam date matches one of their FID working days, AND (2) The date is not in their unavailable dates list.',
        usage: 'The Available Faculty panel automatically updates when you change dates. Faculty in red or grayed out are unavailable for the selected date. Check Faculty Directory to modify FID days or unavailable dates if needed.'
      },
      {
        name: 'Drag-and-Drop Assignment (Desktop)',
        description: 'On larger screens, you can drag faculty names directly from the Available Faculty panel into room invigilator slots.',
        usage: 'Click and hold a faculty name → Drag to a room slot → Release to assign. Slots show faculty short names. You can drag from Available Faculty or reorder between slots.'
      },
      {
        name: 'Dropdown Assignment (Mobile/Compact)',
        description: 'On smaller screens or when drag-drop is impractical, each slot becomes a dropdown selector.',
        usage: 'Tap an empty slot → Dropdown shows available faculty → Select name → It fills the slot. To remove, select the empty option in dropdown or click the X button.'
      },
      {
        name: 'Repeat Duty Control',
        description: 'By default, the system prevents assigning the same faculty to multiple slots on the same date. You can override this if needed.',
        usage: 'Toggle "Allow Repeat Duty" checkbox if you need to assign someone multiple times (e.g., in understaffed scenarios). When disabled, selecting a faculty member in one slot removes them from other dropdowns.'
      },
      {
        name: 'Real-Time Roster Summary',
        description: 'The Roster Summary panel shows completion status for each shift and warns about unfilled slots.',
        usage: 'View at any time during assignment. Shows: Supervisor status (assigned/missing), Room count, Filled slots / Total slots. Red indicators highlight problems.'
      },
      {
        name: 'Duty Count Preview Integration',
        description: 'While assigning, you can see how many duties each faculty member has accumulated across all saved rosters.',
        usage: 'Check the "Duty Count Preview" panel in the sidebar. Faculty with higher duty counts appear at the top. Use this to distribute fairly and avoid overloading certain individuals.'
      },
      {
        name: 'Draft Auto-Save',
        description: 'Your work is continuously saved as a draft in browser local storage, even before you click "Save & Print".',
        usage: 'Just fill in fields and assign faculty. If you navigate away or close the tab, your progress is preserved. Return to the same date to continue where you left off.'
      },
      {
        name: 'Save & Print Workflow',
        description: 'When you click "Save & Print", the system permanently saves the roster, updates duty counts, syncs to cloud (if configured), and opens print preview.',
        usage: 'Click "Save & Print" → Roster saved → Preview opens with multiple export options (Print, PDF, Word, Share, Copy Image) → Close preview returns to editing mode'
      },
    ],
    
    tips: [
      'Fill supervisors first — it sets the accountability structure before distributing room duties',
      'Use Duty Count Preview to identify faculty who need more assignments and achieve fair distribution',
      'If a faculty member should be available but isn\'t showing, check Faculty Directory → their FID days may not include the exam date, or they may be marked unavailable',
      'On mobile, landscape orientation provides more room for comfortable editing',
      'Save frequently if working on complex rosters with many rooms — though drafts auto-save, explicit saves create permanent records',
    ]
  },
  
  facultyDirectoryModule: {
    overview: 'The Faculty Directory is your master database of all staff members. It stores personal details, availability patterns, and is the source of truth for the entire duty roster system.',
    
    features: [
      {
        name: 'Faculty Profile Management',
        description: 'Each faculty record contains: ID (unique identifier), Full Name, Short Name (for compact display on rosters), Designation (e.g., Professor, SACT-I), Department (e.g., Bengali, English), Gender (Male/Female), FID Days (working days), Unavailable Dates (specific days off), and Duty Count (auto-tracked).',
        usage: 'Click any faculty row → Side panel opens with all fields editable → Make changes → Click "Update Faculty" to save'
      },
      {
        name: 'Search and Filter',
        description: 'Quickly locate faculty using text search or department filter.',
        usage: 'Search box: Type any part of name, ID, or designation → Results filter in real-time. Department dropdown: Select "All" or specific department → List narrows to that department only.'
      },
      {
        name: 'Sorting Options',
        description: 'Sort faculty list by Name, Department, Designation, Duty Count, or Faculty ID in ascending/descending order.',
        usage: 'Click column headers or use "Sort by" dropdown → Choose field → Click again to reverse order. Use "Duty Count" sorting to identify who has the most/least duties.'
      },
      {
        name: 'FID (Fixed Institutional Days) Configuration',
        description: 'FID defines which weekdays a faculty member is normally available for work. This is the primary availability filter used throughout the system.',
        usage: 'In edit panel → FID field shows multi-select dropdown → Check all applicable days (Monday, Tuesday, etc.) → System interprets commas or multi-selection → Invalid entries are ignored. Example: "Monday, Wednesday, Friday" means faculty is only available on those days.'
      },
      {
        name: 'Unavailable Dates Management',
        description: 'Mark specific dates when a faculty member cannot be assigned duties (leave, medical, personal commitments).',
        usage: 'Edit panel → Unavailable Dates field → Click to open date picker → Select date(s) → Dates appear as removable chips → Click X on chip to remove a date. Dates must be in YYYY-MM-DD format. Use calendar picker to avoid typing errors.'
      },
      {
        name: 'Short Name Display',
        description: 'Short names (e.g., "Tapasi B" instead of "Tapasi Bandyopadhyay") keep printed rosters clean and readable.',
        usage: 'Edit a faculty → Short Name field → Enter abbreviated version → This appears on all printed rosters and room assignments'
      },
      {
        name: 'Duty Count Tracking',
        description: 'The system automatically increments each faculty\'s duty count when you save a roster. This powers fairness analysis.',
        usage: 'Read-only field visible in faculty details. Updated automatically when rosters are saved. Reset via Dashboard → Reset Operations if you need to clear counts (e.g., start of new semester).'
      },
      {
        name: 'Bulk Faculty Import',
        description: 'Replace entire faculty list by uploading a JSON file with validated structure.',
        usage: 'Dashboard → Operations → Upload Faculty JSON → Select .json file → System validates structure → Imports if valid, rejects if malformed. Download current faculty JSON first as template.'
      },
      {
        name: 'Faculty JSON Download',
        description: 'Export current faculty data as JSON for backup, editing externally, or sharing.',
        usage: 'Dashboard → Operations → Download Faculty JSON → File downloads with all current faculty records in JSON array format'
      },
    ],
    
    tips: [
      'Set FID days accurately for each faculty — this is critical for correct availability filtering in Duty Roster',
      'Use Short Names consistently (e.g., "FirstName L" format) for professional-looking rosters',
      'Update Unavailable Dates proactively when faculty inform you of planned leaves',
      'Keep a backup of Faculty JSON before doing bulk operations or major edits',
      'Gender field is tracked but currently not used in assignment logic — it may support gender-balanced duty allocation in future versions',
    ]
  },
  
  dashboardModule: {
    overview: 'The Dashboard provides oversight, analytics, and administrative operations. Use it to monitor duty distribution fairness, access saved rosters, and perform system maintenance.',
    
    features: [
      {
        name: 'Key Metrics Cards',
        description: 'Four summary cards show: (1) Saved Duty Dates (count of rosters), (2) Total Duty Entries (count of individual assignments), (3) Faculty Assigned (unique faculty who have at least one duty), (4) Duty Fairness Score (0-100%, higher is more equitable distribution).',
        usage: 'View at a glance when you open Dashboard. Click through to details if needed. Fairness Score requires minimum 10 duty entries to calculate reliably.'
      },
      {
        name: 'Saved Dates List',
        description: 'See all saved duty rosters chronologically with completion status, shift info, and quick actions.',
        usage: 'Each card shows: Date, Shift Mode, Filled/Total slot count, Progress bar. Click card to load that roster in Duty Roster view. Use Share button to open preview for that date. Use Delete button to remove a saved roster (prompts confirmation).'
      },
      {
        name: 'Duty Count Preview',
        description: 'Bar chart visualization showing how many duties each faculty member has been assigned, sorted by count (highest to lowest by default).',
        usage: 'Scroll through list to see full distribution. Longer bars = more duties. Use this to identify overloaded faculty or those who need more assignments. Click a name (if implemented) to see duty history for that person.'
      },
      {
        name: 'Weekday Load Distribution',
        description: 'Shows how many examinations fall on each day of the week across all saved rosters.',
        usage: 'Bar chart with days (Mon-Sun) and counts. Identifies if exams are clustered on certain days. Useful for resource planning and understanding scheduling patterns.'
      },
      {
        name: 'Highest Duty Holders',
        description: 'Top 10 faculty ranked by duty count with detailed breakdown.',
        usage: 'Table shows Name, Department, Duty Count. Quickly spot who carries the heaviest load. Consider rotating duties if certain individuals dominate the list.'
      },
      {
        name: 'Reset Operations',
        description: 'Clear duty counts or entire rosters. Two scopes: (1) Reset one specific date, (2) Reset all duty counts globally.',
        usage: 'Reset Duty Counts for a Date: Enter date → Click "Reset Counts for Date" → Only that date\'s duty tallies are recalculated. Reset All Duty Counts: Click "Reset All Duty Counts" → All faculty duty counts set to zero (prompts confirmation). Use these when starting a new academic term or correcting errors.'
      },
      {
        name: 'Backup and Restore',
        description: 'Full system backup includes duties, history, and faculty data in a single JSON file.',
        usage: 'Download Backup: Click "Download Backup" → JSON file downloads with timestamp. Restore Backup: Click file input → Select backup JSON → Confirm replacement → System imports data and refreshes. Always backup before major changes.'
      },
      {
        name: 'Cloud Sync Status (Vercel Blob)',
        description: 'If configured, the app syncs data to Vercel Blob storage for cloud backup and cross-device access.',
        usage: 'Status indicator shows: Idle (waiting), Syncing (in progress), Synced (success), Error (failed), Disabled (not configured). Automatic sync happens after saves. Check settings if sync repeatedly fails.'
      },
    ],
    
    tips: [
      'Review Fairness Score regularly — if it\'s low (<70%), actively assign duties to under-utilized faculty in upcoming rosters',
      'Use "Share" button from saved dates to quickly generate and distribute rosters without opening Duty Roster view',
      'Take a backup before running any reset operation or importing data — this is your safety net',
      'If Duty Count Preview shows imbalance, prioritize lower-count faculty when creating new rosters',
      'Weekday Load helps you understand scheduling patterns — if all exams are on Monday, consider faculty availability and workload',
    ]
  },
  
  advancedFeatures: [
    {
      name: 'Theme Customization',
      description: 'Choose from four visual themes: Light (default white), Dark (dark mode), Solar (warm amber tones), Cool (blue-gray tones).',
      usage: 'Theme dropdown in top-right corner of any view → Select theme → Applies instantly across entire app → Preference is saved in browser'
    },
    {
      name: 'Print Preview Features',
      description: 'Preview mode offers multiple export formats beyond basic printing.',
      usage: 'After clicking "Save & Print": (1) Print - browser print dialog, (2) Download PDF - generates PDF file, (3) Download Word - creates .docx file, (4) Share - uses device share sheet to send via email/messaging, (5) Copy Image - copies roster as image to clipboard'
    },
    {
      name: 'Multi-Date Export',
      description: 'Export rosters for multiple dates at once (for reporting or archival).',
      usage: 'Dashboard → Export options (if visible) → Choose date range or select "All Dates" → Download combined report'
    },
    {
      name: 'Responsive Design',
      description: 'Interface adapts to screen size: Desktop uses drag-drop, tablets use hybrid, mobile uses dropdowns.',
      usage: 'No configuration needed — system detects screen width and enables appropriate interaction mode. Portrait vs landscape affects available space.'
    },
    {
      name: 'Keyboard Shortcuts',
      description: 'Navigate faster using keyboard (desktop only).',
      usage: 'Press Ctrl+P (or Cmd+P) in preview to print directly. Use Tab to move between form fields. Press Enter to confirm modals.'
    },
  ],
  
  bestPractices: [
    'Update FID and Unavailable Dates Weekly: Establish a routine (e.g., every Monday) to review and update faculty availability. This prevents last-minute surprises when creating rosters.',
    
    'Assign Duties Two Weeks in Advance: Give faculty adequate notice. Create rosters at least 14 days before examination dates whenever possible.',
    
    'Use Short Names Consistently: Adopt a standard format (e.g., "FirstName L" where L is last initial) for all faculty. This keeps printed rosters clean and professional.',
    
    'Monitor Fairness Score Monthly: Set a target fairness score (e.g., >80%) and review it monthly. If it drops, actively rebalance by assigning duties to under-utilized faculty.',
    
    'Backup Before Major Operations: Before importing faculty JSON, resetting counts, or clearing data, always download a backup. Store backups in a secure location.',
    
    'Fill Supervisors Before Invigilators: This workflow ensures accountability is set early and helps you think through shift logistics before distributing room-level duties.',
    
    'Check Duty Count Before Assigning: Before creating a new roster, glance at Duty Count Preview to identify who needs more assignments. Prioritize those with lower counts.',
    
    'Validate Before Printing: Use Roster Summary to confirm all supervisors and slots are filled. Never print incomplete rosters — it creates confusion and extra work.',
    
    'Communicate Changes Promptly: If you modify a saved roster, inform affected faculty immediately. Use the Share feature to distribute updated rosters quickly.',
    
    'Leverage Cloud Sync: If Vercel Blob is configured, ensure it syncs successfully after major saves. This provides disaster recovery and cross-device access.',
  ],
  
  troubleshooting: [
    {
      problem: 'Faculty member not appearing in Available Faculty',
      solution: 'Check: (1) Is the exam date one of their FID days? (2) Is the date in their Unavailable Dates list? (3) Go to Faculty Directory → Edit the person → Verify FID includes the needed day → Remove date from unavailable if it was added by mistake'
    },
    {
      problem: 'Drag-and-drop not working',
      solution: 'This is a desktop-only feature. On mobile/tablet, use dropdown selectors instead. If on desktop and still not working, try: (1) Refresh page, (2) Check browser compatibility (modern Chrome/Firefox/Safari/Edge work best), (3) Switch to dropdown mode if issue persists'
    },
    {
      problem: 'Duty counts not updating',
      solution: 'Duty counts only update when you click "Save & Print", not on draft saves. If you saved but counts didn\'t change: (1) Refresh page and check again, (2) Verify the roster was actually saved (check Dashboard Saved Dates), (3) Try re-saving the roster'
    },
    {
      problem: 'Cloud sync failing',
      solution: 'Check sync status indicator. If "Disabled" — Vercel Blob is not configured for this deployment. If "Error" — check browser console for details, verify network connection, contact system administrator if it persists. Local storage still works even if cloud sync fails.'
    },
    {
      problem: 'Cannot delete a saved roster',
      solution: 'From Dashboard Saved Dates → Click the roster card → Click Delete button (trash icon) → Confirm deletion. If delete button is missing, you may need administrator privileges (check with system maintainer).'
    },
    {
      problem: 'PDF/Word download not working',
      solution: 'Ensure you\'re in Print Preview mode (click "Save & Print" first). Check browser popup blocker settings — downloads may be blocked. Try using a different browser. If still failing, use the Print option and save as PDF from print dialog.'
    },
    {
      problem: 'Faculty import JSON rejected',
      solution: 'The JSON must be a valid array of faculty objects. Download current Faculty JSON as a template. Ensure: (1) Valid JSON syntax (use a JSON validator), (2) Each faculty has required fields (id, name, department, designation), (3) FID days use correct weekday names, (4) Dates are YYYY-MM-DD format'
    },
    {
      problem: 'Fairness Score shows "--"',
      solution: 'Fairness Score requires at least 10 total duty entries to calculate. Create more rosters until you reach this threshold. The score becomes reliable once you have enough data points for statistical analysis.'
    },
    {
      problem: 'Lost data after browser crash',
      solution: 'Data is stored in browser local storage. If browser crashed: (1) Reopen app — drafts should auto-restore, (2) Check Dashboard to see last saved rosters, (3) If data is truly lost, restore from last backup JSON (if you have one), (4) Going forward, enable cloud sync and/or backup more frequently'
    },
    {
      problem: 'Cannot assign same faculty to multiple rooms',
      solution: 'By default, the system prevents repeat assignments for fairness. If you intentionally need to assign someone multiple times (e.g., emergency coverage), toggle "Allow Repeat Duty" checkbox in Duty Roster view.'
    },
  ],
  
  technicalDetails: {
    storage: 'All data is stored in browser local storage (IndexedDB or localStorage depending on browser). Optional cloud sync to Vercel Blob if configured by administrator.',
    dataStructure: 'Three main data stores: (1) Duties (saved rosters), (2) History (individual faculty assignments), (3) Faculty (master profile list). Each is backed up independently.',
    compatibility: 'Works in modern browsers: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+. Requires JavaScript enabled. No server required for core functionality (works offline).',
    performance: 'Optimized for up to 500 faculty members and 1000 saved duty rosters. Large datasets may experience slower load times on older devices.',
    security: 'Data is stored locally on your device. Cloud sync (if enabled) uses HTTPS. No passwords or sensitive data is transmitted. Use browser incognito mode for privacy on shared computers.',
  },
  
  glossary: [
    { term: 'FID (Fixed Institutional Days)', definition: 'The weekdays a faculty member is officially scheduled to work at the institution. Used as the primary availability filter.' },
    { term: 'Unavailable Dates', definition: 'Specific calendar dates when a faculty member cannot be assigned duties (leave, appointments, conflicts).' },
    { term: 'Shift Mode', definition: 'Examination timing configuration: Forenoon (morning only), Afternoon (afternoon only), or Both (two shifts in one day).' },
    { term: 'Supervisor', definition: 'Faculty member responsible for overseeing an entire examination shift across all rooms.' },
    { term: 'Invigilator', definition: 'Faculty member assigned to monitor students in a specific examination room during a shift.' },
    { term: 'Duty Count', definition: 'Total number of times a faculty member has been assigned as supervisor or invigilator across all saved rosters.' },
    { term: 'Fairness Score', definition: 'Statistical measure (0-100%) of how evenly duties are distributed. Higher scores indicate more balanced workload distribution.' },
    { term: 'Draft', definition: 'Unsaved roster data temporarily stored in browser. Preserved across page refreshes but not counted in duty analytics until saved.' },
    { term: 'Roster Summary', definition: 'Real-time status panel showing completion of supervisor and invigilator assignments for the current roster.' },
    { term: 'Cloud Sync', definition: 'Optional feature that backs up data to Vercel Blob storage for cross-device access and disaster recovery.' },
  ],
};

const getLocalBackupMeta = (): BackupMeta => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BACKUP_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as BackupMeta;
  } catch {
    return {};
  }
};

const setLocalBackupMeta = (meta: BackupMeta) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta));
};

const isCloudTimestampNewer = (cloudTs?: string, localTs?: string) => {
  if (!cloudTs) return false;
  if (!localTs) return true;
  const cloud = Date.parse(cloudTs);
  const local = Date.parse(localTs);
  if (Number.isNaN(cloud) || Number.isNaN(local)) return cloudTs > localTs;
  return cloud > local;
};

export default function DutyRoster() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('roster');
  
  // Faculty Directory states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [isEditingFaculty, setIsEditingFaculty] = useState(false);
  const [isAddFacultyOpen, setIsAddFacultyOpen] = useState(false);
  const [facultyEdit, setFacultyEdit] = useState({
    designation: '',
    department: '',
    fid: '',
    shortName: '',
    unavailable: '',
    gender: '' as '' | 'Male' | 'Female',
    facultyShift: '' as '' | 'Morning' | 'Day'
  });
  const [newFacultyForm, setNewFacultyForm] = useState({
    id: '',
    name: '',
    designation: '',
    department: '',
    fid: '',
    shortName: '',
    unavailable: '',
    gender: '' as '' | 'Male' | 'Female',
    facultyShift: '' as '' | 'Morning' | 'Day'
  });
  const [unavailableDateInput, setUnavailableDateInput] = useState('');
  const [newUnavailableDateInput, setNewUnavailableDateInput] = useState('');
  const [directorySortBy, setDirectorySortBy] = useState<FacultySortBy>('name');
  const [directorySortOrder, setDirectorySortOrder] = useState<SortOrder>('asc');
  
  // Roster states
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableFaculty, setAvailableFaculty] = useState<Faculty[]>([]);
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [allowRepeatDuty, setAllowRepeatDuty] = useState(false);
  const [exportAllDates, setExportAllDates] = useState(true);
  const [exportFrom, setExportFrom] = useState(new Date().toISOString().split('T')[0]);
  const [exportTo, setExportTo] = useState(new Date().toISOString().split('T')[0]);
  const [dataVersion, setDataVersion] = useState(0);
  const [theme, setTheme] = useState('dark');
  const [availableSortBy, setAvailableSortBy] = useState<FacultySortBy>('name');
  const [availableSortOrder, setAvailableSortOrder] = useState<SortOrder>('asc');
  const [availableSearchOpen, setAvailableSearchOpen] = useState(false);
  const [availableSearchTerm, setAvailableSearchTerm] = useState('');
  const [isCompactScreen, setIsCompactScreen] = useState(false);
  const [blobSyncStatus, setBlobSyncStatus] = useState<BlobSyncStatus>({
    state: 'idle',
    message: 'Waiting for cloud sync'
  });
  const unavailableDateInputRef = useRef<HTMLInputElement | null>(null);
  const newUnavailableDateInputRef = useRef<HTMLInputElement | null>(null);
  const allFaculty = useMemo(() => getAllFaculty(), [dataVersion]);
  const facultyByName = useMemo(() => {
    const map = new Map<string, Faculty>();
    allFaculty.forEach(f => map.set(f.name, f));
    return map;
  }, [allFaculty]);
  const printRef = useRef<HTMLDivElement | null>(null);

  const syncBackupToBlob = async (sections: BackupSection[] = ['duties', 'history', 'faculty']) => {
    try {
      setBlobSyncStatus({ state: 'syncing', message: 'Syncing changes to Blob...' });
      const now = new Date().toISOString();
      const localMeta = getLocalBackupMeta();
      const payloadMeta: BackupMeta = {};
      const payload: {
        duties?: ReturnType<typeof getAllDutyAssignments>;
        history?: ReturnType<typeof getAllDutyHistory>;
        faculty?: ReturnType<typeof getAllFaculty>;
        _meta?: BackupMeta;
      } = {};
      if (sections.includes('duties')) {
        payload.duties = getAllDutyAssignments();
        payloadMeta.duties = now;
        localMeta.duties = now;
      }
      if (sections.includes('history')) {
        payload.history = getAllDutyHistory();
        payloadMeta.history = now;
        localMeta.history = now;
      }
      if (sections.includes('faculty')) {
        payload.faculty = getAllFaculty();
        payloadMeta.faculty = now;
        localMeta.faculty = now;
      }
      payload._meta = payloadMeta;
      const response = await fetch(BLOB_BACKUP_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        setBlobSyncStatus({ state: 'error', message: `Sync failed (${response.status})` });
        console.error('Blob sync failed with status:', response.status);
        return;
      }
      const result = await response.json().catch(() => null);
      if (result?.skipped === 'blob_not_configured') {
        setLocalBackupMeta(localMeta);
        setBlobSyncStatus({ state: 'disabled', message: 'Blob not configured in this environment' });
        return;
      }
      setLocalBackupMeta(localMeta);
      setBlobSyncStatus({
        state: 'synced',
        message: `Cloud backup synced (${sections.join(', ')})`,
        at: now
      });
    } catch (error) {
      setBlobSyncStatus({ state: 'error', message: 'Sync failed. Using local data only.' });
      console.error('Blob sync failed:', error);
    }
  };

  const hydrateFromBlob = async () => {
    try {
      setBlobSyncStatus({ state: 'syncing', message: 'Checking cloud backup...' });
      const response = await fetch(BLOB_BACKUP_API, { cache: 'no-store' });
      if (response.status === 404) {
        setBlobSyncStatus({ state: 'disabled', message: 'No cloud backup configured/found' });
        return;
      }
      if (!response.ok) {
        setBlobSyncStatus({ state: 'error', message: `Restore failed (${response.status})` });
        console.error('Blob restore failed with status:', response.status);
        return;
      }
      const data = await response.json() as {
        duties?: ReturnType<typeof getAllDutyAssignments>;
        history?: ReturnType<typeof getAllDutyHistory>;
        faculty?: ReturnType<typeof getAllFaculty>;
        _meta?: BackupMeta;
      };
      if (!data || typeof data !== 'object' || !('faculty' in data)) {
        setBlobSyncStatus({ state: 'disabled', message: 'No valid cloud backup found' });
        return;
      }
      const localData = exportBackupData();
      const localMeta = getLocalBackupMeta();
      const cloudMeta = data._meta || {};
      const merged = { ...localData };
      const applied: BackupSection[] = [];

      (['duties', 'history', 'faculty'] as BackupSection[]).forEach(section => {
        if (!(section in data)) return;
        const cloudTs = cloudMeta[section];
        const localTs = localMeta[section];
        if (isCloudTimestampNewer(cloudTs, localTs)) {
          (merged as any)[section] = (data as any)[section];
          if (cloudTs) localMeta[section] = cloudTs;
          applied.push(section);
        }
      });

      if (applied.length === 0) {
        setBlobSyncStatus({
          state: 'synced',
          message: 'Local data is newer than cloud backup',
          at: new Date().toISOString()
        });
        return;
      }

      importBackupData(merged);
      setLocalBackupMeta(localMeta);
      setDataVersion(v => v + 1);
      loadDutyAssignment(selectedDate);
      setAvailableFaculty(getAvailableFacultyByDate(selectedDate, getAllFaculty()));
      setBlobSyncStatus({
        state: 'synced',
        message: `Cloud backup restored (${applied.join(', ')})`,
        at: new Date().toISOString()
      });
    } catch (error) {
      setBlobSyncStatus({ state: 'error', message: 'Restore failed. Using local data.' });
      console.error('Blob restore failed:', error);
    }
  };
  
  // Form fields
  const [course, setCourse] = useState('B.A. / B.Sc. / B.Com.');
  const [semester, setSemester] = useState('SEM V');
  const [year, setYear] = useState('2025');
  const [curriculum, setCurriculum] = useState<'CCF' | 'CBCS'>('CCF');
  const [shiftMode, setShiftMode] = useState<'both' | 'forenoon' | 'afternoon'>('both');
  
  // Shift 1
  const [time1, setTime1] = useState('Morning (10 AM Onwards)');
  const [super1, setSuper1] = useState('');
  const [rooms1, setRooms1] = useState<Room[]>([
    { id: 1, roomNo: '02', students: '24', invigilators: '2', slots: [] },
    { id: 2, roomNo: '06', students: '30', invigilators: '2', slots: [] }
  ]);
  
  // Shift 2
  const [time2, setTime2] = useState('Afternoon (2 PM Onwards)');
  const [super2, setSuper2] = useState('');
  const [rooms2, setRooms2] = useState<Room[]>([
    { id: 3, roomNo: '18', students: '23', invigilators: '2', slots: [] }
  ]);

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);

  // Initialize faculty data and load saved assignment
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'dashboard' || tab === 'roster' || tab === 'directory' || tab === 'about') {
      setViewMode(tab);
    }
  }, []);

  useEffect(() => {
    initializeFacultyData(facultyData as Faculty[]);
    syncFacultyMetadataFromSeed(facultyData as Faculty[]);
    // Refresh memoized faculty reads after localStorage bootstrap.
    setDataVersion(v => v + 1);
    const filtered = getAvailableFacultyByDate(selectedDate, getAllFaculty());
    setAvailableFaculty(filtered);
    
    // Load saved duty for this date
    loadDutyAssignment(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    void hydrateFromBlob();
  }, []);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('vic_theme') : null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vic_theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 1023px), (pointer: coarse)');
    const apply = () => setIsCompactScreen(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  const normalizeRooms = (rooms: Room[]) => {
    let changed = false;
    const normalized = rooms.map(room => {
      const count = Number.isNaN(parseInt(room.invigilators || '0'))
        ? 0
        : parseInt(room.invigilators || '0');
      if (room.slots.length !== count) {
        changed = true;
        return {
          ...room,
          slots: createSlots(count, room.slots)
        };
      }
      return room;
    });
    return { normalized, changed };
  };

  // Ensure slots are present for rooms after loading or edits
  useEffect(() => {
    const { normalized, changed } = normalizeRooms(rooms1);
    if (changed) setRooms1(normalized);
  }, [rooms1]);

  useEffect(() => {
    const { normalized, changed } = normalizeRooms(rooms2);
    if (changed) setRooms2(normalized);
  }, [rooms2]);

  const loadDutyAssignment = (date: string) => {
    const saved = getDutyAssignmentByDate(date);
    let draft: DutyAssignment | null = null;
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(`${DRAFT_KEY_PREFIX}${date}`);
      if (raw) {
        try {
          draft = JSON.parse(raw);
        } catch {
          draft = null;
        }
      }
    }

    // Always prioritize explicitly saved roster for that date.
    // Draft is only a fallback when no saved roster exists yet.
    const source = saved || draft;

    if (source) {
      setCourse(source.course);
      setSemester(source.semester);
      setYear(source.year);
      setCurriculum(normalizeCurriculum(source.curriculum));
      setShiftMode(source.shiftMode);
      
      if (source.shift1) {
        setTime1(source.shift1.time);
        setSuper1(source.shift1.supervisor);
        setRooms1(source.shift1.rooms);
      }
      
      if (source.shift2) {
        setTime2(source.shift2.time);
        setSuper2(source.shift2.supervisor);
        setRooms2(source.shift2.rooms);
      }
    } else {
      // Reset to defaults
      setSuper1('');
      setSuper2('');
      setRooms1([
        { id: Date.now(), roomNo: '02', students: '24', invigilators: '2', slots: createSlots(2, []) },
        { id: Date.now() + 1, roomNo: '06', students: '30', invigilators: '2', slots: createSlots(2, []) }
      ]);
      setRooms2([
        { id: Date.now() + 2, roomNo: '18', students: '23', invigilators: '2', slots: createSlots(2, []) }
      ]);
    }
  };

  const createSlots = (count: number, existingSlots: InvigilatorSlot[]): InvigilatorSlot[] => {
    const slots: InvigilatorSlot[] = [];
    for (let i = 0; i < count; i++) {
      slots.push(existingSlots[i] || {
        id: `slot-${Date.now()}-${i}`,
        facultyName: null,
        order: i
      });
    }
    return slots;
  };

  const getAvailableFacultyByDate = (dateValue: string, source: Faculty[]) => {
    const date = parseISODateLocal(dateValue);
    if (!date) return source;
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    return source.filter(f => {
      const unavailableDates = parseUnavailableDates(f.unavailable || '');
      if (unavailableDates.includes(dateValue)) return false;
      const fidDays = parseFidDays(f.fid || '');
      return !fidDays.includes(dayName);
    });
  };

  const departments = ['all', ...Array.from(new Set(facultyData.map(f => f.department)))];

  const filteredFaculty = allFaculty.filter(faculty => {
    const matchesSearch = faculty.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         faculty.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         faculty.designation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = selectedDepartment === 'all' || faculty.department === selectedDepartment;
    return matchesSearch && matchesDepartment;
  });

  const sortFacultyList = (
    list: Faculty[],
    sortBy: FacultySortBy,
    sortOrder: SortOrder
  ): Faculty[] => {
    const direction = sortOrder === 'asc' ? 1 : -1;
    const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
    const byNumber = (a: number, b: number) => a - b;

    return [...list].sort((a, b) => {
      let result = 0;
      if (sortBy === 'name') result = byText(a.name, b.name);
      if (sortBy === 'department') result = byText(a.department || '', b.department || '');
      if (sortBy === 'designation') result = byText(a.designation || '', b.designation || '');
      if (sortBy === 'fid') result = byText(a.fid || '', b.fid || '');
      if (sortBy === 'shift') result = byText(getFacultyShiftLabel(a) || '', getFacultyShiftLabel(b) || '');
      if (sortBy === 'dutyCount') result = byNumber(a.dutyCount || 0, b.dutyCount || 0);
      if (result === 0) result = byText(a.name, b.name);
      return result * direction;
    });
  };

  const sortedDirectoryFaculty = sortFacultyList(filteredFaculty, directorySortBy, directorySortOrder);

  // Get all assigned faculty names
  const getAllAssignedFaculty = (shift: 1 | 2): Set<string> => {
    const rooms = shift === 1 ? rooms1 : rooms2;
    const supervisor = shift === 1 ? super1 : super2;
    const assigned = new Set<string>();
    
    if (supervisor) assigned.add(supervisor);
    rooms.forEach(room => {
      room.slots.forEach(slot => {
        if (slot.facultyName) assigned.add(slot.facultyName);
      });
    });
    
    return assigned;
  };

  const takenByShift1 = getAllAssignedFaculty(1);
  const takenByShift2 = getAllAssignedFaculty(2);
  
  const assignedToday = new Set<string>([...takenByShift1, ...takenByShift2]);
  const dutyCountById = new Map(allFaculty.map(f => [f.id, f.dutyCount || 0]));
  const availableFacultyWithCounts = availableFaculty.map(f => ({
    ...f,
    dutyCount: dutyCountById.get(f.id) ?? f.dutyCount ?? 0
  }));
  const eligibleFaculty = allowRepeatDuty
    ? availableFacultyWithCounts
    : availableFacultyWithCounts.filter(f => !assignedToday.has(f.name));
  const sortedEligibleFaculty = sortFacultyList(eligibleFaculty, availableSortBy, availableSortOrder);
  const visibleAvailableFaculty = sortedEligibleFaculty.filter(faculty => {
    const q = availableSearchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      faculty.name.toLowerCase().includes(q) ||
      faculty.department.toLowerCase().includes(q) ||
      faculty.designation.toLowerCase().includes(q) ||
      (faculty.shortName || '').toLowerCase().includes(q) ||
      faculty.id.toLowerCase().includes(q)
    );
  });

  const availForSuper1 = super1
    ? [
        ...sortedEligibleFaculty,
        ...availableFacultyWithCounts.filter(f => f.name === super1)
      ].filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i)
    : sortedEligibleFaculty;
  const availForSuper2 = super2
    ? [
        ...sortedEligibleFaculty,
        ...availableFacultyWithCounts.filter(f => f.name === super2)
      ].filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i)
    : sortedEligibleFaculty;

  const buildSlotFacultyOptions = (shift: 1 | 2) => {
    const rooms = shift === 1 ? rooms1 : rooms2;
    const assignedInShift = new Set<string>();
    rooms.forEach(room => room.slots.forEach(slot => {
      if (slot.facultyName) assignedInShift.add(slot.facultyName);
    }));

    return [
      ...sortedEligibleFaculty,
      ...availableFacultyWithCounts.filter(f => assignedInShift.has(f.name))
    ].filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i);
  };

  const slotOptions1 = buildSlotFacultyOptions(1);
  const slotOptions2 = buildSlotFacultyOptions(2);

  const canGenerate = 
    (shiftMode !== 'afternoon' ? super1 && rooms1.every(r => r.slots.every(s => s.facultyName)) : true) &&
    (shiftMode !== 'forenoon' ? super2 && rooms2.every(r => r.slots.every(s => s.facultyName)) : true);

  const summarizeShift = (rooms: Room[], supervisor: string) => {
    const roomCount = rooms.length;
    const students = rooms.reduce((sum, r) => sum + (parseInt(r.students || '0') || 0), 0);
    const slots = rooms.reduce((sum, r) => sum + r.slots.length, 0);
    const filledSlots = rooms.reduce((sum, r) => sum + r.slots.filter(s => s.facultyName).length, 0);
    return {
      roomCount,
      students,
      slots,
      filledSlots,
      supervisorAssigned: Boolean(supervisor)
    };
  };

  const summary1 = summarizeShift(rooms1, super1);
  const summary2 = summarizeShift(rooms2, super2);

  const allAssignments = useMemo(() => getAllDutyAssignments(), [dataVersion]);
  const allHistory = useMemo(() => getAllDutyHistory(), [dataVersion]);

  const countAssignmentSlots = (assignment: DutyAssignment) => {
    const countShift = (shift?: ShiftData) => {
      if (!shift) return { total: 0, filled: 0 };
      const total = shift.rooms.reduce((sum, r) => sum + r.slots.length, 0);
      const filled = shift.rooms.reduce((sum, r) => sum + r.slots.filter(s => s.facultyName).length, 0);
      return { total, filled };
    };

    const s1 = assignment.shiftMode !== 'afternoon' ? countShift(assignment.shift1) : { total: 0, filled: 0 };
    const s2 = assignment.shiftMode !== 'forenoon' ? countShift(assignment.shift2) : { total: 0, filled: 0 };
    return { total: s1.total + s2.total, filled: s1.filled + s2.filled };
  };

  const savedAssignments = [...allAssignments].sort((a, b) => b.date.localeCompare(a.date));
  const assignedFacultyIds = new Set(allHistory.map(h => h.facultyId));
  const facultyByLoad = [...allFaculty].sort((a, b) => (b.dutyCount || 0) - (a.dutyCount || 0));
  const maxDutyCount = facultyByLoad[0]?.dutyCount || 1;
  const dutyCounts = allFaculty.map(f => f.dutyCount || 0);
  const meanDuty = dutyCounts.length
    ? dutyCounts.reduce((sum, count) => sum + count, 0) / dutyCounts.length
    : 0;
  const varianceDuty = meanDuty === 0
    ? 0
    : dutyCounts.reduce((sum, count) => sum + Math.pow(count - meanDuty, 2), 0) / dutyCounts.length;
  const stdDuty = Math.sqrt(varianceDuty);
  const cvRatio = meanDuty === 0 ? 0 : (stdDuty / meanDuty);
  const dutyFairnessScore = Math.max(0, Math.min(100, Math.round(100 / (1 + cvRatio))));
  const MIN_DUTIES_FOR_FAIRNESS = 20;
  const isFairnessReliable = allHistory.length >= MIN_DUTIES_FOR_FAIRNESS;

  const weekdayDutyMap = (() => {
    const map = new Map<string, number>([
      ['Mon', 0], ['Tue', 0], ['Wed', 0], ['Thu', 0], ['Fri', 0], ['Sat', 0], ['Sun', 0]
    ]);
    allHistory.forEach(item => {
      const day = formatISODateLocal(item.date, 'en-US', { weekday: 'short' });
      map.set(day, (map.get(day) || 0) + 1);
    });
    return map;
  })();
  const maxWeekdayCount = Math.max(...Array.from(weekdayDutyMap.values()), 1);

  const openSavedDate = (date: string) => {
    // Always force-load the selected date, even if it's already selected.
    loadDutyAssignment(date);
    setAvailableFaculty(getAvailableFacultyByDate(date, getAllFaculty()));
    setSelectedDate(date);
    setViewMode('roster');
  };

  const resetSavedDate = (date: string) => {
    const ok = window.confirm(`Delete saved duty and duty counts for ${date}? This cannot be undone.`);
    if (!ok) return;
    resetDutyCountsForDate(date);
    deleteDutyAssignment(date);
    clearDraftForDate(date);
    if (selectedDate === date) {
      loadDutyAssignment(date);
      setAvailableFaculty(getAvailableFacultyByDate(date, getAllFaculty()));
    }
    setDataVersion(v => v + 1);
    void syncBackupToBlob(['duties', 'history', 'faculty']);
  };

  const addRoom = (shift: 1 | 2) => {
    const newRoom: Room = { 
      id: Date.now(), 
      roomNo: '', 
      students: '', 
      invigilators: '1',
      slots: createSlots(1, [])
    };
    if (shift === 1) setRooms1([...rooms1, newRoom]);
    else setRooms2([...rooms2, newRoom]);
  };

  const removeRoom = (shift: 1 | 2, roomId: number) => {
    if (shift === 1) {
      const room = rooms1.find(r => r.id === roomId);
      if (room) {
        // Faculty in deleted room become available again (automatically handled by filtering)
        setRooms1(rooms1.filter(r => r.id !== roomId));
      }
    } else {
      const room = rooms2.find(r => r.id === roomId);
      if (room) {
        setRooms2(rooms2.filter(r => r.id !== roomId));
      }
    }
  };

  const updateRoom = (shift: 1 | 2, id: number, field: keyof Room, value: string) => {
    if (shift === 1) {
      setRooms1(rooms1.map(r => {
        if (r.id === id) {
          const updated = { ...r, [field]: value };
          // If invigilators count changes, update slots
          if (field === 'invigilators') {
            updated.slots = createSlots(parseInt(value || '0'), r.slots);
          }
          return updated;
        }
        return r;
      }));
    } else {
      setRooms2(rooms2.map(r => {
        if (r.id === id) {
          const updated = { ...r, [field]: value };
          if (field === 'invigilators') {
            updated.slots = createSlots(parseInt(value || '0'), r.slots);
          }
          return updated;
        }
        return r;
      }));
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, item: DragItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const removeFacultyFromRooms = (rooms: Room[], facultyName: string): Room[] => {
    return rooms.map(room => ({
      ...room,
      slots: room.slots.map(slot =>
        slot.facultyName === facultyName ? { ...slot, facultyName: null } : slot
      )
    }));
  };

  const clearFacultyFromShift = (rooms: Room[], supervisor: string, facultyName: string) => {
    return {
      rooms: removeFacultyFromRooms(rooms, facultyName),
      supervisor: supervisor === facultyName ? '' : supervisor
    };
  };

  const clearSlotById = (rooms: Room[], roomId?: number, slotId?: string): Room[] => {
    if (!roomId || !slotId) return rooms;
    return rooms.map(room => {
      if (room.id !== roomId) return room;
      return {
        ...room,
        slots: room.slots.map(slot =>
          slot.id === slotId ? { ...slot, facultyName: null } : slot
        )
      };
    });
  };

  useEffect(() => {
    const enforceWithinShift = (rooms: Room[], supervisor: string, blocked?: Set<string>) => {
      const seen = new Set<string>(blocked || []);
      let nextSupervisor = supervisor;
      if (nextSupervisor && seen.has(nextSupervisor)) {
        nextSupervisor = '';
      }
      if (nextSupervisor) seen.add(nextSupervisor);

      const nextRooms = rooms.map(room => ({
        ...room,
        slots: room.slots.map(slot => {
          if (!slot.facultyName) return slot;
          if (seen.has(slot.facultyName)) return { ...slot, facultyName: null };
          seen.add(slot.facultyName);
          return slot;
        })
      }));

      return { rooms: nextRooms, supervisor: nextSupervisor, seen };
    };

    const shift1 = enforceWithinShift(rooms1, super1);
    let nextRooms1 = shift1.rooms;
    let nextSuper1 = shift1.supervisor;
    let nextRooms2 = rooms2;
    let nextSuper2 = super2;

    if (allowRepeatDuty) {
      const shift2 = enforceWithinShift(rooms2, super2);
      nextRooms2 = shift2.rooms;
      nextSuper2 = shift2.supervisor;
    } else {
      const shift2 = enforceWithinShift(rooms2, super2, shift1.seen);
      nextRooms2 = shift2.rooms;
      nextSuper2 = shift2.supervisor;
    }

    setRooms1(nextRooms1);
    setSuper1(nextSuper1);
    setRooms2(nextRooms2);
    setSuper2(nextSuper2);
  }, [allowRepeatDuty]);

  const applyFacultyToSlot = (
    shift: 1 | 2,
    roomId: number,
    slotId: string,
    item: DragItem
  ) => {
    if (!item.facultyName) return;

    const facultyName = item.facultyName;
    let nextRooms1 = rooms1;
    let nextRooms2 = rooms2;
    let nextSuper1 = super1;
    let nextSuper2 = super2;

    // Remove from source slot if moving an already assigned faculty.
    if (item.sourceShift === 1) {
      nextRooms1 = clearSlotById(nextRooms1, item.sourceRoomId, item.sourceSlotId);
    } else if (item.sourceShift === 2) {
      nextRooms2 = clearSlotById(nextRooms2, item.sourceRoomId, item.sourceSlotId);
    }

    // Enforce single assignment per shift (also prevent supervisor+slot duplicates)
    if (shift === 1) {
      const cleared = clearFacultyFromShift(nextRooms1, nextSuper1, facultyName);
      nextRooms1 = cleared.rooms;
      nextSuper1 = cleared.supervisor;
    } else {
      const cleared = clearFacultyFromShift(nextRooms2, nextSuper2, facultyName);
      nextRooms2 = cleared.rooms;
      nextSuper2 = cleared.supervisor;
    }

    // If repeat duty is disabled, remove from the other shift too
    if (!allowRepeatDuty) {
      if (shift === 1) {
        const clearedOther = clearFacultyFromShift(nextRooms2, nextSuper2, facultyName);
        nextRooms2 = clearedOther.rooms;
        nextSuper2 = clearedOther.supervisor;
      } else {
        const clearedOther = clearFacultyFromShift(nextRooms1, nextSuper1, facultyName);
        nextRooms1 = clearedOther.rooms;
        nextSuper1 = clearedOther.supervisor;
      }
    }

    const applyToRooms = (rooms: Room[]) =>
      rooms.map(room => {
        if (room.id !== roomId) return room;
        return {
          ...room,
          slots: room.slots.map(slot =>
            slot.id === slotId ? { ...slot, facultyName } : slot
          )
        };
      });

    if (shift === 1) {
      nextRooms1 = applyToRooms(nextRooms1);
    } else {
      nextRooms2 = applyToRooms(nextRooms2);
    }

    setRooms1(nextRooms1);
    setSuper1(nextSuper1);
    setRooms2(nextRooms2);
    setSuper2(nextSuper2);
  };

  const handleDropOnSlot = (shift: 1 | 2, roomId: number, slotId: string) => {
    if (!draggedItem || !draggedItem.facultyName) return;
    applyFacultyToSlot(shift, roomId, slotId, draggedItem);
    setDraggedItem(null);
  };

  const handleSelectSlotFaculty = (shift: 1 | 2, roomId: number, slotId: string, facultyName: string) => {
    if (!facultyName) {
      removeFromSlot(shift, roomId, slotId);
      return;
    }
    applyFacultyToSlot(shift, roomId, slotId, { type: 'faculty', facultyName });
  };

  const handleSupervisorChange = (shift: 1 | 2, value: string) => {
    if (shift === 1) {
      if (!value) {
        setSuper1('');
        return;
      }
      let nextRooms1 = removeFacultyFromRooms(rooms1, value);
      let nextSuper1 = value;
      let nextRooms2 = rooms2;
      let nextSuper2 = super2;

      if (!allowRepeatDuty) {
        const clearedOther = clearFacultyFromShift(rooms2, super2, value);
        nextRooms2 = clearedOther.rooms;
        nextSuper2 = clearedOther.supervisor;
      }

      setRooms1(nextRooms1);
      setSuper1(nextSuper1);
      setRooms2(nextRooms2);
      setSuper2(nextSuper2);
      return;
    }

    if (!value) {
      setSuper2('');
      return;
    }
    let nextRooms2 = removeFacultyFromRooms(rooms2, value);
    let nextSuper2 = value;
    let nextRooms1 = rooms1;
    let nextSuper1 = super1;

    if (!allowRepeatDuty) {
      const clearedOther = clearFacultyFromShift(rooms1, super1, value);
      nextRooms1 = clearedOther.rooms;
      nextSuper1 = clearedOther.supervisor;
    }

    setRooms1(nextRooms1);
    setSuper1(nextSuper1);
    setRooms2(nextRooms2);
    setSuper2(nextSuper2);
  };

  const removeFromSlot = (shift: 1 | 2, roomId: number, slotId: string) => {
    const rooms = shift === 1 ? rooms1 : rooms2;
    const setRooms = shift === 1 ? setRooms1 : setRooms2;

    const updatedRooms = rooms.map(room => {
      if (room.id === roomId) {
        return {
          ...room,
          slots: room.slots.map(slot =>
            slot.id === slotId ? { ...slot, facultyName: null } : slot
          )
        };
      }
      return room;
    });

    setRooms(updatedRooms);
  };

  const buildAssignment = (): DutyAssignment => {
    const existing = getDutyAssignmentByDate(selectedDate);
    const now = new Date().toISOString();
    const assignment: DutyAssignment = {
      id: existing?.id || `duty-${selectedDate}`,
      date: selectedDate,
      course,
      semester,
      year,
      curriculum,
      shiftMode,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (shiftMode !== 'afternoon') {
      assignment.shift1 = {
        time: time1,
        supervisor: super1,
        rooms: rooms1
      };
    }

    if (shiftMode !== 'forenoon') {
      assignment.shift2 = {
        time: time2,
        supervisor: super2,
        rooms: rooms2
      };
    }

    return assignment;
  };

  const clearDraftForDate = (date: string) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${date}`);
  };

  const clearAllDrafts = () => {
    if (typeof window === 'undefined') return;
    Object.keys(localStorage)
      .filter(key => key.startsWith(DRAFT_KEY_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  };

  const saveCurrentAssignment = () => {
    const assignment = buildAssignment();
    saveDutyAssignment(assignment);
    updateDutyCounts(assignment);
    clearDraftForDate(selectedDate);
    setDataVersion(v => v + 1);
    void syncBackupToBlob(['duties', 'history', 'faculty']);
  };

  const handlePreviewAndPrint = () => {
    setIsPrintMode(true);
  };

  const handleSaveAndPrint = () => {
    saveCurrentAssignment();
    setIsPrintMode(true);
  };

  const allocateInvigilators = (rooms: Room[]) => {
    return rooms.map(room => ({
      ...room,
      assignedInvigilators: room.slots
        .filter(s => s.facultyName)
        .map(s => s.facultyName as string)
    }));
  };

  const facultyShortNameMap = new Map(
    allFaculty.map(f => [f.name, f.shortName || f.name])
  );
  const toShortName = (name: string) => facultyShortNameMap.get(name) || name;

  const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const buildRosterCsv = () => {
    const allAssignments = getAllDutyAssignments();
    const allDates = Array.from(new Set(allAssignments.map(a => a.date))).sort();

    const dates = exportAllDates
      ? allDates
      : allDates.filter(d => d >= exportFrom && d <= exportTo);

    const history = getAllDutyHistory();
    const assignedByDate = new Map<string, Map<string, string[]>>();
    const labelFor = (shift: number, role: string) =>
      `S${shift}-${role === 'supervisor' ? 'Supervisor' : 'Invigilator'}`;
    const orderFor = (label: string) => {
      if (label === 'S1-Supervisor') return 1;
      if (label === 'S1-Invigilator') return 2;
      if (label === 'S2-Supervisor') return 3;
      if (label === 'S2-Invigilator') return 4;
      return 9;
    };

    history.forEach(h => {
      if (!assignedByDate.has(h.date)) assignedByDate.set(h.date, new Map());
      const byFaculty = assignedByDate.get(h.date)!;
      if (!byFaculty.has(h.facultyId)) byFaculty.set(h.facultyId, []);
      const list = byFaculty.get(h.facultyId)!;
      const label = labelFor(h.shift, h.role);
      if (!list.includes(label)) list.push(label);
    });

    const faculty = allFaculty;
    const header = ['Faculty', ...dates].map(csvEscape).join(',');
    const rows = faculty.map(f => {
      const cells = dates.map(d => {
        const labels = assignedByDate.get(d)?.get(f.id) || [];
        return labels.sort((a, b) => orderFor(a) - orderFor(b)).join(' | ');
      });
      return [f.name, ...cells].map(csvEscape).join(',');
    });

    return [header, ...rows].join('\n');
  };

  const downloadRosterCsv = () => {
    const csv = buildRosterCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `duty-roster-${exportAllDates ? 'all' : `${exportFrom}_to_${exportTo}`}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleResetDate = () => {
    const ok = window.confirm(`Reset saved duty and duty counts for ${selectedDate}? This cannot be undone.`);
    if (!ok) return;
    resetDutyCountsForDate(selectedDate);
    deleteDutyAssignment(selectedDate);
    clearDraftForDate(selectedDate);
    loadDutyAssignment(selectedDate);
    setAvailableFaculty(getAvailableFacultyByDate(selectedDate, getAllFaculty()));
    setDataVersion(v => v + 1);
    void syncBackupToBlob(['duties', 'history', 'faculty']);
  };

  const handleResetAll = () => {
    const ok = window.confirm('Reset ALL saved duty rosters and duty counts? This cannot be undone.');
    if (!ok) return;
    resetAllDutyCounts();
    clearAllDutyAssignments();
    clearAllDrafts();
    loadDutyAssignment(selectedDate);
    setAvailableFaculty(getAvailableFacultyByDate(selectedDate, getAllFaculty()));
    setDataVersion(v => v + 1);
    void syncBackupToBlob(['duties', 'history', 'faculty']);
  };

  const startEditFaculty = () => {
    if (!selectedFaculty) return;
    const fidDays = parseFidDays(selectedFaculty.fid || '');
    const unavailableDates = parseUnavailableDates(selectedFaculty.unavailable || '');
    setFacultyEdit({
      designation: selectedFaculty.designation || '',
      department: selectedFaculty.department || '',
      fid: formatFidDays(fidDays),
      shortName: selectedFaculty.shortName || '',
      unavailable: formatUnavailableDates(unavailableDates),
      gender: selectedFaculty.gender || '',
      facultyShift: getFacultyShiftLabel(selectedFaculty)
    });
    setUnavailableDateInput('');
    setIsEditingFaculty(true);
  };

  const cancelEditFaculty = () => {
    setIsEditingFaculty(false);
    setUnavailableDateInput('');
  };

  const saveEditedFaculty = () => {
    if (!selectedFaculty) return;
    if (!facultyEdit.department.trim() || !facultyEdit.designation.trim()) {
      alert('Department and Designation are required.');
      return;
    }
    const updated = updateFacultyRecord(selectedFaculty.id, {
      department: facultyEdit.department.trim(),
      designation: facultyEdit.designation.trim(),
      fid: formatFidDays(parseFidDays(facultyEdit.fid)),
      shortName: facultyEdit.shortName.trim() || undefined,
      unavailable: formatUnavailableDates(parseUnavailableDates(facultyEdit.unavailable)) || undefined,
      gender: facultyEdit.gender || undefined,
      facultyShift: facultyEdit.facultyShift || undefined
    });
    if (!updated) {
      alert('Failed to update faculty record.');
      return;
    }
    setSelectedFaculty(updated);
    setIsEditingFaculty(false);
    setUnavailableDateInput('');
    setAvailableFaculty(getAvailableFacultyByDate(selectedDate, getAllFaculty()));
    setDataVersion(v => v + 1);
    void syncBackupToBlob(['faculty']);
  };

  const toggleFidDay = (day: string) => {
    setFacultyEdit(prev => {
      const selected = parseFidDays(prev.fid);
      const next = selected.includes(day)
        ? selected.filter(d => d !== day)
        : [...selected, day];
      return { ...prev, fid: formatFidDays(next) };
    });
  };

  const addUnavailableDate = () => {
    if (!unavailableDateInput) return;
    setFacultyEdit(prev => {
      const existing = parseUnavailableDates(prev.unavailable);
      return {
        ...prev,
        unavailable: formatUnavailableDates([...existing, unavailableDateInput])
      };
    });
    setUnavailableDateInput('');
  };

  const removeUnavailableDate = (date: string) => {
    setFacultyEdit(prev => {
      const next = parseUnavailableDates(prev.unavailable).filter(d => d !== date);
      return { ...prev, unavailable: formatUnavailableDates(next) };
    });
  };

  const resetNewFacultyForm = () => {
    setNewFacultyForm({
      id: '',
      name: '',
      designation: '',
      department: '',
      fid: '',
      shortName: '',
      unavailable: '',
      gender: '',
      facultyShift: ''
    });
    setNewUnavailableDateInput('');
  };

  const openAddFacultyModal = () => {
    resetNewFacultyForm();
    setIsAddFacultyOpen(true);
  };

  const closeAddFacultyModal = () => {
    setIsAddFacultyOpen(false);
    resetNewFacultyForm();
  };

  const toggleNewFacultyFidDay = (day: string) => {
    setNewFacultyForm(prev => {
      const selected = parseFidDays(prev.fid);
      const next = selected.includes(day)
        ? selected.filter(d => d !== day)
        : [...selected, day];
      return { ...prev, fid: formatFidDays(next) };
    });
  };

  const addNewFacultyUnavailableDate = () => {
    if (!newUnavailableDateInput) return;
    setNewFacultyForm(prev => {
      const existing = parseUnavailableDates(prev.unavailable);
      return {
        ...prev,
        unavailable: formatUnavailableDates([...existing, newUnavailableDateInput])
      };
    });
    setNewUnavailableDateInput('');
  };

  const removeNewFacultyUnavailableDate = (date: string) => {
    setNewFacultyForm(prev => {
      const next = parseUnavailableDates(prev.unavailable).filter(d => d !== date);
      return { ...prev, unavailable: formatUnavailableDates(next) };
    });
  };

  const saveNewFaculty = () => {
    const id = newFacultyForm.id.trim();
    const name = newFacultyForm.name.trim();
    const designation = newFacultyForm.designation.trim();
    const department = newFacultyForm.department.trim();

    if (!id || !name || !designation || !department) {
      alert('Faculty ID, Name, Department, and Designation are required.');
      return;
    }

    const byId = allFaculty.some(f => f.id.trim().toLowerCase() === id.toLowerCase());
    if (byId) {
      alert('Faculty ID already exists. Please use a unique ID.');
      return;
    }
    const byName = allFaculty.some(f => f.name.trim().toLowerCase() === name.toLowerCase());
    if (byName) {
      alert('Faculty name already exists. Please use a unique name.');
      return;
    }

    const newRecord: Faculty = {
      id,
      name,
      designation,
      department,
      fid: formatFidDays(parseFidDays(newFacultyForm.fid)),
      dutyCount: 0,
      shortName: newFacultyForm.shortName.trim() || undefined,
      unavailable: formatUnavailableDates(parseUnavailableDates(newFacultyForm.unavailable)) || undefined,
      gender: newFacultyForm.gender || undefined,
      facultyShift: newFacultyForm.facultyShift || undefined
    };

    const latest = getAllFaculty();
    replaceFacultyData([...latest, newRecord]);
    setDataVersion(v => v + 1);
    setAvailableFaculty(getAvailableFacultyByDate(selectedDate, getAllFaculty()));
    setSelectedFaculty(newRecord);
    setIsEditingFaculty(false);
    closeAddFacultyModal();
    void syncBackupToBlob(['faculty']);
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
  };

  const downloadFacultyJson = () => {
    const data = getAllFaculty();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vic-faculty-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const sanitizeCurrentFormByFaculty = (facultyList: Faculty[]) => {
    const allowed = new Set(facultyList.map(f => f.name));
    if (super1 && !allowed.has(super1)) setSuper1('');
    if (super2 && !allowed.has(super2)) setSuper2('');
    setRooms1(prev => prev.map(room => ({
      ...room,
      slots: room.slots.map(slot =>
        slot.facultyName && !allowed.has(slot.facultyName)
          ? { ...slot, facultyName: null }
          : slot
      )
    })));
    setRooms2(prev => prev.map(room => ({
      ...room,
      slots: room.slots.map(slot =>
        slot.facultyName && !allowed.has(slot.facultyName)
          ? { ...slot, facultyName: null }
          : slot
      )
    })));
  };

  const handleImportFacultyJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        alert('Invalid faculty file. Expected a JSON array.');
        return;
      }

      const normalized: Faculty[] = parsed.map((item: any, idx: number) => {
        const name = String(item?.name || '').trim();
        const department = String(item?.department || '').trim();
        const designation = String(item?.designation || '').trim();
        if (!name || !department || !designation) {
          throw new Error(`Row ${idx + 1}: name, department and designation are required.`);
        }
        const id = String(item?.id || `${department.toUpperCase().slice(0, 4)}-${idx + 1}`);
        const dutyCount = Number.isFinite(Number(item?.dutyCount)) ? Number(item?.dutyCount) : 0;
        const facultyShift = normalizeFacultyShift(
          item?.facultyShift ?? item?.shift ?? item?.teacherShift ?? item?.dutyShift ?? item?.session
        );
        return {
          id,
          name,
          department,
          designation,
          fid: String(item?.fid || '').trim(),
          unavailable: String(item?.unavailable || '').trim(),
          shortName: String(item?.shortName || '').trim() || undefined,
          dutyCount,
          gender: item?.gender === 'Male' || item?.gender === 'Female' ? item.gender : undefined,
          facultyShift: facultyShift || undefined
        };
      });

      const uniqueById = new Set<string>();
      const uniqueByName = new Set<string>();
      normalized.forEach((f, idx) => {
        if (uniqueById.has(f.id)) throw new Error(`Duplicate id at row ${idx + 1}: ${f.id}`);
        if (uniqueByName.has(f.name.toLowerCase())) throw new Error(`Duplicate name at row ${idx + 1}: ${f.name}`);
        uniqueById.add(f.id);
        uniqueByName.add(f.name.toLowerCase());
      });

      const ok = window.confirm(
        `Replace faculty master with ${normalized.length} records?\n\nThis updates faculty directory and roster assignment options.`
      );
      if (!ok) return;

      replaceFacultyData(normalized);
      sanitizeCurrentFormByFaculty(normalized);
      setSelectedFaculty(null);
      setAvailableFaculty(getAvailableFacultyByDate(selectedDate, normalized));
      setDataVersion(v => v + 1);
      void syncBackupToBlob(['faculty']);
      alert('Faculty data updated successfully.');
    } catch (error: any) {
      alert(error?.message || 'Failed to import faculty data.');
    } finally {
      e.target.value = '';
    }
  };

  const downloadWord = () => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const formattedDate = formatRosterHeadingDate(selectedDate);
    const title = `${course} ${semester} Exam ${year} (Under ${curriculum})`;
    const shift1Rows = allocateInvigilators(rooms1);
    const shift2Rows = allocateInvigilators(rooms2);

    const renderShift = (
      timeLabel: string,
      supervisorName: string,
      rows: Array<{ roomNo?: string; students?: string; assignedInvigilators: string[] }>
    ) => {
      const rowHtml = rows
        .map((room) => {
          const roomText = `${room.roomNo || ''}${room.students ? ` (${room.students})` : ''}` || '—';
          const invigilators = Array.isArray(room.assignedInvigilators)
            ? room.assignedInvigilators.map(toShortName).join(', ') || '—'
            : '—';
          return `<tr>
  <td>${escapeHtml(roomText)}</td>
  <td>${escapeHtml(invigilators)}</td>
</tr>`;
        })
        .join('');

      return `<div class="print-shift">
  <div class="print-header">
    <p class="print-title">${escapeHtml(title)}</p>
    <p class="print-meta">Date: ${escapeHtml(formattedDate)}</p>
    <p class="print-meta">Time: ${escapeHtml(timeLabel)}</p>
    <p class="print-meta">Super: ${escapeHtml(supervisorName ? toShortName(supervisorName) : '—')}</p>
  </div>
  <table class="print-table">
    <colgroup>
      <col style="width:45mm" />
      <col style="width:auto" />
    </colgroup>
    <thead>
      <tr>
        <th>Room No</th>
        <th>Invigilators</th>
      </tr>
    </thead>
    <tbody>${rowHtml}</tbody>
  </table>
</div>`;
    };

    const sections: string[] = [];
    if (shiftMode !== 'afternoon') {
      sections.push(renderShift(time1, super1, shift1Rows));
    }
    if (shiftMode !== 'forenoon') {
      sections.push(renderShift(time2, super2, shift2Rows));
    }

    const content = `${sections.join('\n')}
<div class="print-signature-row">
  <table class="print-signature-table" role="presentation">
    <tr>
      <td class="print-signature-spacer"></td>
      <td class="print-signature-cell">
        <div class="print-signature-line"></div>
        <p class="print-signature-primary">Principal</p>
        <p class="print-signature-secondary">Victoria Institution (College)</p>
      </td>
    </tr>
  </table>
</div>`;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: "Times New Roman", Times, serif; color: #000; margin: 0; }
  .print-shift { margin: 0 0 36px 0; }
  .print-header { text-align: center; margin: 0 0 12px 0; }
  .print-title { font-size: 12pt; font-weight: 700; margin: 0 0 6px 0; }
  .print-meta { font-size: 12pt; font-weight: 700; margin: 0 0 5px 0; }
  .print-table { width: 170mm; margin: 0 auto 0 auto; border-collapse: collapse; table-layout: fixed; border: 1px solid #000; font-size: 11pt; }
  .print-table th, .print-table td { border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top; }
  .print-table th { font-size: 12pt; font-weight: 700; }
  .print-signature-row { width: 170mm; margin: 72px auto 0 auto; }
  .print-signature-table { width: 170mm; border-collapse: collapse; table-layout: fixed; border: 0; }
  .print-signature-table td { border: 0; padding: 0; }
  .print-signature-spacer { width: 114mm; }
  .print-signature-cell { width: 56mm; text-align: center; vertical-align: top; }
  .print-signature-line { width: 56mm; border-top: 1px solid #000; margin: 96px 0 0 0; height: 0; }
  .print-signature-primary { font-size: 12pt; font-weight: 700; margin: 8px 0 10px 0; }
  .print-signature-secondary { font-size: 12pt; font-weight: 700; margin: 0; }
</style>
</head>
<body>${content}</body>
</html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `duty-chart-${selectedDate}.doc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const getPreviewCanvas = async () => {
    if (!printRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const element = printRef.current;
    return html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      windowWidth: element.scrollWidth
    });
  };

  const getPdfBlob = async (): Promise<Blob | null> => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginRight = 20;
    const marginTop = 16;
    const marginBottom = 18;
    const tableWidth = 170;
    const tableX = (pageWidth - tableWidth) / 2;
    const roomColWidth = 45;
    const invigilatorColWidth = tableWidth - roomColWidth;
    let y = marginTop;

    const examTitle = `${course} ${semester} Exam ${year} (Under ${curriculum})`;
    const formattedDate = formatRosterHeadingDate(selectedDate);
    const shift1Rows = allocateInvigilators(rooms1);
    const shift2Rows = allocateInvigilators(rooms2);

      const ensureSpace = (requiredHeight: number) => {
        if (y + requiredHeight <= pageHeight - marginBottom) return;
        pdf.addPage();
        y = marginTop;
      };

    const drawCenteredLine = (text: string, fontSize = 12) => {
        pdf.setFont('times', 'bold');
        pdf.setFontSize(fontSize);
        pdf.text(text, pageWidth / 2, y, { align: 'center' });
        y += fontSize <= 11 ? 5 : 6;
      };

      const drawTableHeader = () => {
        const rowHeight = 8;
        pdf.setLineWidth(0.2);
        pdf.rect(tableX, y, tableWidth, rowHeight);
        pdf.line(tableX + roomColWidth, y, tableX + roomColWidth, y + rowHeight);
        pdf.setFont('times', 'bold');
        pdf.setFontSize(11);
        pdf.text('Room No', tableX + 2, y + 5.5);
        pdf.text('Invigilators', tableX + roomColWidth + 2, y + 5.5);
        y += rowHeight;
      };

      const drawTableRows = (rows: Array<{ roomNo?: string; students?: string; assignedInvigilators: string[] }>) => {
        drawTableHeader();
        pdf.setFontSize(11);
        rows.forEach((room) => {
          const roomText = `${room.roomNo || ''}${room.students ? ` (${room.students})` : ''}` || '—';
          const invigilatorsText = Array.isArray(room.assignedInvigilators)
            ? room.assignedInvigilators.map(toShortName).join(', ') || '—'
            : '—';
          const invigilatorLines = pdf.splitTextToSize(invigilatorsText, invigilatorColWidth - 4) as string[];
          const lineCount = Math.max(1, invigilatorLines.length);
          const rowHeight = Math.max(8, lineCount * 5 + 2);

          ensureSpace(rowHeight + 1);
          if (y === marginTop) {
            drawTableHeader();
          }

          pdf.rect(tableX, y, tableWidth, rowHeight);
          pdf.line(tableX + roomColWidth, y, tableX + roomColWidth, y + rowHeight);
          pdf.setFont('times', 'normal');
          pdf.text(roomText, tableX + 2, y + 5.5);
          pdf.text(invigilatorLines, tableX + roomColWidth + 2, y + 5.5);
          y += rowHeight;
        });
      };

      const drawShiftSection = (
        timeLabel: string,
        supervisorName: string,
        rows: Array<{ roomNo?: string; students?: string; assignedInvigilators: string[] }>
      ) => {
        ensureSpace(44);
        drawCenteredLine(examTitle, 12);
        drawCenteredLine(`Date: ${formattedDate}`, 11);
        drawCenteredLine(`Time: ${timeLabel}`, 11);
        drawCenteredLine(`Super: ${supervisorName ? toShortName(supervisorName) : '—'}`, 11);
        y += 2;
        drawTableRows(rows);
        y += 10;
      };

      if (shiftMode !== 'afternoon') {
        drawShiftSection(time1, super1, shift1Rows || []);
      }
      if (shiftMode !== 'forenoon') {
        drawShiftSection(time2, super2, shift2Rows || []);
      }

      ensureSpace(34);
      y += 14; // Signature writing space
      const lineWidth = 56;
      const lineX = pageWidth - marginRight - lineWidth;
      pdf.setLineWidth(0.2);
      pdf.line(lineX, y, lineX + lineWidth, y);
      y += 6;
      pdf.setFont('times', 'bold');
      pdf.setFontSize(12);
      pdf.text('Principal', lineX + lineWidth / 2, y, { align: 'center' });
      y += 6;
      pdf.text('Victoria Institution (College)', lineX + lineWidth / 2, y, { align: 'center' });

    return pdf.output('blob');
  };

  const getPreviewImageBlob = async (): Promise<Blob | null> => {
    const canvas = await getPreviewCanvas();
    if (!canvas) return null;
    return await new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'));
  };

  const downloadPdf = async () => {
    let blob: Blob | null = null;
    try {
      blob = await getPdfBlob();
    } catch (error) {
      console.error('Vector PDF generation failed:', error);
      alert('Failed to generate vector PDF. Please try again.');
      return;
    }
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `duty-chart-${selectedDate}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const shareMessage = `VIC Duty Roster - ${formatISODateLocal(selectedDate, 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    weekday: 'short'
  })}`;

  const buildShareMessageForDate = (date: string) => {
    const assignment = getDutyAssignmentByDate(date);
    if (!assignment) return `VIC Duty Roster - ${date}`;
    const shiftLabel =
      assignment.shiftMode === 'both'
        ? 'Both shifts'
        : assignment.shiftMode === 'forenoon'
          ? 'Forenoon'
          : 'Afternoon';
    return `VIC Duty Roster - ${formatISODateLocal(date, 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      weekday: 'short'
    })}\n${assignment.course} ${assignment.semester}\nShift: ${shiftLabel}`;
  };

  const handleNativeShare = async () => {
    if (!navigator.share) {
      alert('Native share is not supported in this browser.');
      return;
    }
    try {
      const imageBlob = await getPreviewImageBlob();
      if (imageBlob) {
        const imageFile = new File([imageBlob], `duty-chart-${selectedDate}.png`, { type: 'image/png' });
        const canShareFiles = (navigator as any).canShare?.({ files: [imageFile] });
        if (canShareFiles) {
          await navigator.share({ title: 'VIC Duty Roster', text: shareMessage, files: [imageFile] });
          return;
        }
      }
      await navigator.share({ title: 'VIC Duty Roster', text: shareMessage });
    } catch {
      // user-cancel and share errors are ignored intentionally
    }
  };


  const copyPreviewImage = async () => {
    try {
      if (!navigator.clipboard || !('write' in navigator.clipboard)) {
        alert('Image clipboard is not supported in this browser.');
        return;
      }
      const imageBlob = await getPreviewImageBlob();
      if (!imageBlob) return;
      await (navigator.clipboard as any).write([new ClipboardItem({ 'image/png': imageBlob })]);
      alert('Image copied to clipboard.');
    } catch {
      alert('Failed to copy image to clipboard.');
    }
  };


  const shareSavedDateFromDashboard = async (date: string) => {
    const text = buildShareMessageForDate(date);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Duty Roster - ${date}`, text });
        return;
      } catch {
        // ignore cancellation and continue fallback
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      alert('Share text copied to clipboard.');
    } catch {
      alert('Share is not supported on this browser.');
    }
  };

  const downloadBackup = () => {
    const data = exportBackupData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vic-duty-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = window.confirm('Import backup and replace current data? This cannot be undone.');
    if (!ok) {
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !('faculty' in data)) {
        alert('Invalid backup file.');
        return;
      }
      importBackupData(data);
      clearAllDrafts();
      setDataVersion(v => v + 1);
      void syncBackupToBlob(['duties', 'history', 'faculty']);
    } catch {
      alert('Failed to import backup.');
    } finally {
      e.target.value = '';
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const existing = getDutyAssignmentByDate(selectedDate);
    const now = new Date().toISOString();
    const draft: DutyAssignment = {
      id: existing?.id || `duty-${selectedDate}`,
      date: selectedDate,
      course,
      semester,
      year,
      curriculum,
      shiftMode,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...(shiftMode !== 'afternoon'
        ? { shift1: { time: time1, supervisor: super1, rooms: rooms1 } }
        : {}),
      ...(shiftMode !== 'forenoon'
        ? { shift2: { time: time2, supervisor: super2, rooms: rooms2 } }
        : {})
    };
    localStorage.setItem(`${DRAFT_KEY_PREFIX}${selectedDate}`, JSON.stringify(draft));
  }, [
    course,
    semester,
    year,
    curriculum,
    shiftMode,
    time1,
    super1,
    rooms1,
    time2,
    super2,
    rooms2
  ]);

  // Print Mode
  if (isPrintMode) {
    const allocation1 = allocateInvigilators(rooms1);
    const allocation2 = allocateInvigilators(rooms2);
    
    return (
      <div className="min-h-screen bg-white p-3 sm:p-6 md:p-8">
        <div className="print:hidden mb-6 flex flex-wrap gap-3 items-center">
          <button 
            onClick={() => setIsPrintMode(false)} 
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
          >
            <X size={18} /> Close Preview
          </button>
          <button 
            onClick={() => window.print()} 
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30"
          >
            <Printer size={18} /> Print
          </button>
          <button
            onClick={downloadPdf}
            className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/30"
          >
            <Printer size={18} /> Download PDF
          </button>
          <button
            onClick={downloadWord}
            className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/30"
          >
            <Printer size={18} /> Download Word
          </button>
          <button
            onClick={handleNativeShare}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors"
          >
            <Share2 size={16} /> Share
          </button>
          <button
            onClick={copyPreviewImage}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors"
          >
            <Copy size={16} /> Copy Image
          </button>
        </div>

        <div
          ref={printRef}
          className="max-w-[760px] mx-auto p-4 sm:p-6 bg-white"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >

          {shiftMode !== 'afternoon' && (
            <div className="print-shift mb-10">
              <div className="print-header text-center mb-4 space-y-1">
                <p className="print-title text-lg font-semibold">
                  {course} {semester} Exam {year} (Under {curriculum})
                </p>
                <p className="print-meta text-base font-semibold">
                  Date: {formatRosterHeadingDate(selectedDate)}
                </p>
                <p className="print-meta text-base font-semibold">Time: {time1}</p>
                <p className="print-meta text-base font-semibold">Super: {super1 ? toShortName(super1) : '—'}</p>
              </div>
              
              <table className="print-table w-[88%] mx-auto border-collapse border border-black table-fixed text-[15px]">
                <thead>
                  <tr>
                    <th className="border border-black p-2 font-semibold text-left w-32">Room No</th>
                    <th className="border border-black p-2 font-semibold text-left">Invigilators</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation1.map((room: any) => (
                    <tr key={room.id}>
                      <td className="border border-black p-2">
                        {room.roomNo}{room.students ? ` (${room.students})` : ''}
                      </td>
                      <td className="border border-black p-2 break-words whitespace-normal">
                        {room.assignedInvigilators.map(toShortName).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {shiftMode !== 'forenoon' && (
            <div className="print-shift mb-10">
              <div className="print-header text-center mb-4 space-y-1">
                <p className="print-title text-lg font-semibold">
                  {course} {semester} Exam {year} (Under {curriculum})
                </p>
                <p className="print-meta text-base font-semibold">
                  Date: {formatRosterHeadingDate(selectedDate)}
                </p>
                <p className="print-meta text-base font-semibold">Time: {time2}</p>
                <p className="print-meta text-base font-semibold">Super: {super2 ? toShortName(super2) : '—'}</p>
              </div>
              
              <table className="print-table w-[88%] mx-auto border-collapse border border-black table-fixed text-[15px]">
                <thead>
                  <tr>
                    <th className="border border-black p-2 font-semibold text-left w-32">Room No</th>
                    <th className="border border-black p-2 font-semibold text-left">Invigilators</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation2.map((room: any) => (
                    <tr key={room.id}>
                      <td className="border border-black p-2">
                        {room.roomNo}{room.students ? ` (${room.students})` : ''}
                      </td>
                      <td className="border border-black p-2 break-words whitespace-normal">
                        {room.assignedInvigilators.map(toShortName).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="print-signature-row mt-16 flex justify-end" style={{ width: '100%', textAlign: 'left' }}>
            <div className="print-signature-block w-56 text-center" style={{ width: '14rem', marginLeft: 'auto', marginRight: 0, textAlign: 'center' }}>
              <div className="print-signature-space" aria-hidden="true" style={{ height: '64px' }}></div>
              <div className="print-signature-line border-t border-black pt-1" style={{ width: '100%', borderTop: '1px solid #000' }}></div>
              <p className="print-signature-text font-semibold mt-2">Principal</p>
              <p className="print-signature-text font-semibold">Victoria Institution (College)</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard View
  if (viewMode === 'dashboard') {
    return (
      <div className="min-h-screen theme-root" data-theme={theme}>
        <header className="theme-header border-b sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-8 w-full md:w-auto">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">VIC Duty Roster</h1>
                <nav className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setViewMode('dashboard')}
                    className="px-4 py-2 rounded-lg bg-blue-100 text-blue-700 font-medium flex items-center gap-2"
                  >
                    <LayoutDashboard size={18} />
                    Dashboard
                  </button>
                  <button
                    onClick={() => setViewMode('roster')}
                    className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                  >
                    <ClipboardList size={18} />
                    Duty Roster
                  </button>
                  <button
                    onClick={() => setViewMode('directory')}
                    className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                  >
                    <Users size={18} />
                    Faculty Directory
                  </button>
                  <button
                    onClick={() => setViewMode('about')}
                    className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                  >
                    <Info size={18} />
                    About
                  </button>
                </nav>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="nord">Nord</option>
                  <option value="forest">Forest</option>
                  <option value="solar">Solar</option>
                  <option value="cool">Cool</option>
                  <option value="latte">Latte</option>
                </select>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="theme-card rounded-xl p-5">
              <div className="text-sm text-slate-600">Saved Duty Dates</div>
              <div className="text-3xl font-bold text-slate-900 mt-1">{savedAssignments.length}</div>
            </div>
            <div className="theme-card rounded-xl p-5">
              <div className="text-sm text-slate-600">Total Duty Entries</div>
              <div className="text-3xl font-bold text-slate-900 mt-1">{allHistory.length}</div>
            </div>
            <div className="theme-card rounded-xl p-5">
              <div className="text-sm text-slate-600">Faculty Assigned</div>
              <div className="text-3xl font-bold text-slate-900 mt-1">{assignedFacultyIds.size}</div>
            </div>
            <div className="theme-card rounded-xl p-5">
              <div className="text-sm text-slate-600">Duty Fairness Score</div>
              <div className="text-3xl font-bold text-slate-900 mt-1">
                {isFairnessReliable ? `${dutyFairnessScore}%` : '--'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {isFairnessReliable
                  ? 'Higher means better distribution'
                  : `Need at least ${MIN_DUTIES_FOR_FAIRNESS} duty entries (now ${allHistory.length})`}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <div className="theme-card rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-slate-900">Saved Dates</h2>
                  <span className="text-xs text-slate-500">Click a date to load in Duty Roster</span>
                </div>
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {savedAssignments.length === 0 ? (
                    <div className="theme-panel rounded-lg p-4 text-sm text-slate-600">
                      No saved duty roster yet.
                    </div>
                  ) : (
                    savedAssignments.map(item => {
                      const slot = countAssignmentSlots(item);
                      const completion = slot.total ? Math.round((slot.filled / slot.total) * 100) : 0;
                      return (
                        <div
                          key={item.id}
                          onClick={() => openSavedDate(item.date)}
                          className="w-full text-left theme-panel rounded-lg p-4 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors cursor-pointer"
                        >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                              <div className="font-semibold text-slate-900">
                                {formatISODateLocal(item.date, 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })}
                              </div>
                              <div className="text-xs text-slate-600 mt-1">
                                Shift: {item.shiftMode === 'both' ? 'Both' : item.shiftMode === 'forenoon' ? 'Forenoon' : 'Afternoon'}
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
                              <div className="text-right">
                                <div className="text-xs text-slate-500">Filled Slots</div>
                                <div className="font-semibold text-slate-900">{slot.filled}/{slot.total}</div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  shareSavedDateFromDashboard(item.date);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 text-xs font-semibold hover:bg-violet-100 transition-colors"
                                title="Open preview and share this date"
                              >
                                <Share2 size={13} />
                                Share
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resetSavedDate(item.date);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-red-50 text-red-700 border border-red-200 text-xs font-semibold hover:bg-red-100 transition-colors"
                                title="Delete this saved date"
                              >
                                <Trash2 size={13} />
                                Delete
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div className="h-full bg-blue-600" style={{ width: `${completion}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="theme-card rounded-xl p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-lg font-bold text-slate-900">Roster Tools</h2>
                  <span
                    className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold ${
                      blobSyncStatus.state === 'synced'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : blobSyncStatus.state === 'syncing'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : blobSyncStatus.state === 'error'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                    title={blobSyncStatus.at ? `Last update: ${new Date(blobSyncStatus.at).toLocaleString('en-GB')}` : undefined}
                  >
                    {blobSyncStatus.message}
                  </span>
                </div>
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800">Roster Export</div>
                  <p className="text-xs text-slate-500 -mt-2">
                    What: exports roster assignments to CSV. How: choose all dates or a range, then download.
                  </p>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={exportAllDates}
                      onChange={(e) => setExportAllDates(e.target.checked)}
                    />
                    All dates
                  </label>
                  {!exportAllDates && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">From</label>
                        <input
                          type="date"
                          value={exportFrom}
                          onChange={(e) => setExportFrom(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">To</label>
                        <input
                          type="date"
                          value={exportTo}
                          onChange={(e) => setExportTo(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={downloadRosterCsv}
                    className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                  >
                    Download CSV
                  </button>

                  <div className="text-sm font-semibold text-slate-800 pt-4 border-t border-slate-200">Reset</div>
                  <p className="text-xs text-slate-500 -mt-2">
                    What: clears saved duties and recalculates duty counts. How: use selected date reset for one day, or reset all for full wipe.
                  </p>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Target date</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <button
                    onClick={handleResetDate}
                    className="w-full px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors"
                  >
                    Reset Selected Date
                  </button>
                  <button
                    onClick={handleResetAll}
                    className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                  >
                    Reset All Data
                  </button>

                  <div className="text-sm font-semibold text-slate-800 pt-4 border-t border-slate-200">Backup & Restore</div>
                  <p className="text-xs text-slate-500 -mt-2">
                    What: backup contains duties, history, and faculty master. How: download JSON snapshot, or upload JSON to replace current data.
                  </p>
                  <button
                    onClick={downloadBackup}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                  >
                    Download Backup
                  </button>
                  <label className="block text-xs text-slate-600">
                    Restore from backup
                    <input
                      type="file"
                      accept="application/json"
                      onChange={handleImportBackup}
                      className="mt-2 w-full text-xs"
                    />
                  </label>

                  <div className="text-sm font-semibold text-slate-800 pt-4 border-t border-slate-200">Faculty Data</div>
                  <p className="text-xs text-slate-500 -mt-2">
                    What: faculty file stores profile/FID/unavailable fields. How: download current master JSON or upload a validated JSON array to replace it.
                  </p>
                  <button
                    onClick={downloadFacultyJson}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                  >
                    Download Faculty JSON
                  </button>
                  <label className="block text-xs text-slate-600">
                    Upload faculty JSON
                    <input
                      type="file"
                      accept="application/json"
                      onChange={handleImportFacultyJson}
                      className="mt-2 w-full text-xs"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="theme-card rounded-xl p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <TrendingUp size={18} />
                  Duty Count Preview
                </h2>
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {facultyByLoad.length === 0 ? (
                    <div className="text-sm text-slate-600">No duty data yet.</div>
                  ) : (
                    facultyByLoad.map(faculty => {
                      const count = faculty.dutyCount || 0;
                      const width = Math.max(6, Math.round((count / maxDutyCount) * 100));
                      return (
                        <div key={faculty.id}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-700 truncate pr-2">{faculty.name}</span>
                            <span className="text-slate-500">{count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="theme-card rounded-xl p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Weekday Load</h2>
                <div className="space-y-2">
                  {Array.from(weekdayDutyMap.entries()).map(([day, count]) => {
                    const width = Math.round((count / maxWeekdayCount) * 100);
                    return (
                      <div key={day} className="grid grid-cols-[42px_1fr_36px] items-center gap-2">
                        <span className="text-xs text-slate-600">{day}</span>
                        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full bg-violet-500" style={{ width: `${width}%` }} />
                        </div>
                        <span className="text-xs text-slate-600 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    );
  }

  // Faculty Directory View
  if (viewMode === 'directory') {
    return (
      <div className="min-h-screen theme-root" data-theme={theme}>
        <header className="theme-header border-b sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-8 w-full md:w-auto">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">VIC Duty Roster</h1>
                <nav className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setViewMode('dashboard')}
                    className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                  >
                    <LayoutDashboard size={18} />
                    Dashboard
                  </button>
                  <button
                    onClick={() => setViewMode('roster')}
                    className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                  >
                    <ClipboardList size={18} />
                    Duty Roster
                  </button>
                  <button
                    onClick={() => setViewMode('directory')}
                    className="px-4 py-2 rounded-lg bg-blue-100 text-blue-700 font-medium flex items-center gap-2"
                  >
                    <Users size={18} />
                    Faculty Directory
                  </button>
                  <button
                    onClick={() => setViewMode('about')}
                    className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                  >
                    <Info size={18} />
                    About
                  </button>
                </nav>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="nord">Nord</option>
                  <option value="forest">Forest</option>
                  <option value="solar">Solar</option>
                  <option value="cool">Cool</option>
                  <option value="latte">Latte</option>
                </select>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-8">
          <div className="theme-card rounded-xl shadow-sm p-6 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  placeholder="Search by name, department, or designation..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="pl-10 pr-10 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none cursor-pointer min-w-[200px]"
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept}>
                      {dept === 'all' ? 'All Departments' : dept}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Sort by</label>
                <select
                  value={directorySortBy}
                  onChange={(e) => setDirectorySortBy(e.target.value as FacultySortBy)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="name">Name</option>
                  <option value="department">Department</option>
                  <option value="designation">Designation</option>
                  <option value="dutyCount">Duty Count</option>
                  <option value="fid">FID</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Order</label>
                <select
                  value={directorySortOrder}
                  onChange={(e) => setDirectorySortOrder(e.target.value as SortOrder)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm text-slate-600">
              <span className="font-medium">
                Showing {filteredFaculty.length} of {allFaculty.length} faculty members
              </span>
              <button
                onClick={openAddFacultyModal}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                <Plus size={16} />
                Add Faculty
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedDirectoryFaculty.map((faculty) => (
              <div
                key={faculty.id}
                onClick={() => setSelectedFaculty(faculty)}
                className="theme-card rounded-xl p-6 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    {faculty.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                      {faculty.name}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">{faculty.designation}</p>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 size={14} className="text-slate-400" />
                        <span className="text-slate-700">{faculty.department}</span>
                      </div>
                      {faculty.fid && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock size={14} className="text-slate-400" />
                          <span className="text-slate-700">FID: {faculty.fid}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <ClipboardList size={14} className="text-blue-500" />
                        <span className="text-blue-600 font-semibold">{faculty.dutyCount} duties</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {isAddFacultyOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={closeAddFacultyModal}
          >
            <div className="theme-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Add New Faculty</h2>
                    <p className="text-blue-100 mt-1">Enter all required profile and availability details</p>
                  </div>
                  <button
                    onClick={closeAddFacultyModal}
                    className="text-white/80 hover:text-white transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Faculty ID *</label>
                    <input
                      type="text"
                      value={newFacultyForm.id}
                      onChange={(e) => setNewFacultyForm(v => ({ ...v, id: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      placeholder="e.g., ENG-104"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Full Name *</label>
                    <input
                      type="text"
                      value={newFacultyForm.name}
                      onChange={(e) => setNewFacultyForm(v => ({ ...v, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      placeholder="e.g., Ananya Das"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Department *</label>
                    <input
                      type="text"
                      value={newFacultyForm.department}
                      onChange={(e) => setNewFacultyForm(v => ({ ...v, department: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      placeholder="e.g., English"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Designation *</label>
                    <input
                      type="text"
                      value={newFacultyForm.designation}
                      onChange={(e) => setNewFacultyForm(v => ({ ...v, designation: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      placeholder="e.g., Assistant Professor"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Short Name</label>
                    <input
                      type="text"
                      value={newFacultyForm.shortName}
                      onChange={(e) => setNewFacultyForm(v => ({ ...v, shortName: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      placeholder="e.g., Ananya D"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Gender</label>
                    <select
                      value={newFacultyForm.gender}
                      onChange={(e) => setNewFacultyForm(v => ({ ...v, gender: e.target.value as '' | 'Male' | 'Female' }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="">Unspecified</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-600 mb-1">Faculty Shift</label>
                    <select
                      value={newFacultyForm.facultyShift}
                      onChange={(e) => setNewFacultyForm(v => ({ ...v, facultyShift: e.target.value as '' | 'Morning' | 'Day' }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="">Unspecified</option>
                      <option value="Morning">Morning</option>
                      <option value="Day">Day</option>
                    </select>
                  </div>
                </div>

                <div className="theme-panel border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-600 font-medium mb-2">
                    <Clock size={18} />
                    Faculty Improvement Day (FID)
                  </div>
                  <details className="rounded-lg border border-slate-300 bg-white px-3 py-2">
                    <summary className="cursor-pointer list-none text-sm text-slate-800 flex items-center justify-between">
                      <span>
                        {parseFidDays(newFacultyForm.fid).length > 0
                          ? formatFidDays(parseFidDays(newFacultyForm.fid))
                          : 'Select FID weekdays'}
                      </span>
                      <ChevronDown size={16} className="text-slate-500" />
                    </summary>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {WEEKDAY_OPTIONS.map(option => {
                        const isSelected = parseFidDays(newFacultyForm.fid).includes(option.value);
                        return (
                          <label
                            key={`new-fid-option-${option.value}`}
                            className="flex items-center justify-between px-2.5 py-2 rounded-md border border-slate-200 hover:border-blue-300 cursor-pointer"
                          >
                            <span className="text-sm text-slate-700">{option.label}</span>
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleNewFacultyFidDay(option.value)}
                                className="h-4 w-4 accent-blue-600"
                              />
                              {isSelected && <Check size={14} className="text-blue-600" />}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                </div>

                <div className="theme-panel rounded-lg p-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Unavailable Dates</label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          ref={newUnavailableDateInputRef}
                          type="date"
                          value={newUnavailableDateInput}
                          onChange={(e) => setNewUnavailableDateInput(e.target.value)}
                          className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm no-native-calendar-icon"
                          style={{ colorScheme: theme === 'dark' || theme === 'nord' || theme === 'forest' ? 'dark' : 'light' }}
                        />
                        <button
                          type="button"
                          onClick={() => newUnavailableDateInputRef.current?.showPicker?.()}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-600"
                          aria-label="Open calendar"
                        >
                          <Calendar size={14} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={addNewFacultyUnavailableDate}
                        className="px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {parseUnavailableDates(newFacultyForm.unavailable).length === 0 ? (
                        <span className="text-xs text-slate-500">No blocked dates selected</span>
                      ) : (
                        parseUnavailableDates(newFacultyForm.unavailable).map((dateValue) => (
                          <span
                            key={`new-unavailable-${dateValue}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium"
                          >
                            {new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                            <button
                              type="button"
                              onClick={() => removeNewFacultyUnavailableDate(dateValue)}
                              className="text-amber-700 hover:text-amber-900"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={closeAddFacultyModal}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveNewFaculty}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold"
                  >
                    Save Faculty
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedFaculty && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              setSelectedFaculty(null);
              setIsEditingFaculty(false);
            }}
          >
            <div className="theme-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-8 rounded-t-2xl">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-2xl backdrop-blur-sm">
                      {selectedFaculty.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">{selectedFaculty.name}</h2>
                      <p className="text-blue-100 mt-1">{selectedFaculty.designation}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditingFaculty ? (
                      <>
                        <button
                          onClick={cancelEditFaculty}
                          className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveEditedFaculty}
                          className="px-3 py-1.5 rounded-lg bg-white text-blue-700 hover:bg-blue-50 text-sm font-semibold"
                        >
                          Save
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={startEditFaculty}
                        className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedFaculty(null);
                        setIsEditingFaculty(false);
                      }}
                      className="text-white/80 hover:text-white transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                      <Building2 size={16} />
                      Department
                    </div>
                    {isEditingFaculty ? (
                      <input
                        type="text"
                        value={facultyEdit.department}
                        onChange={(e) => setFacultyEdit(v => ({ ...v, department: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    ) : (
                      <p className="text-slate-900 font-semibold">{selectedFaculty.department}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                      <UserCircle2 size={16} />
                      Faculty ID
                    </div>
                    <p className="text-slate-900 font-semibold">{selectedFaculty.id}</p>
                  </div>
                </div>

                {(selectedFaculty.fid || isEditingFaculty) && (
                  <div className="theme-panel border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-600 font-medium mb-2">
                      <Clock size={18} />
                      Faculty Improvement Day (FID)
                    </div>
                    {isEditingFaculty ? (
                      <div className="space-y-2">
                        <details className="rounded-lg border border-slate-300 bg-white px-3 py-2">
                          <summary className="cursor-pointer list-none text-sm text-slate-800 flex items-center justify-between">
                            <span>
                              {parseFidDays(facultyEdit.fid).length > 0
                                ? formatFidDays(parseFidDays(facultyEdit.fid))
                                : 'Select FID weekdays'}
                            </span>
                            <ChevronDown size={16} className="text-slate-500" />
                          </summary>
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {WEEKDAY_OPTIONS.map(option => {
                              const isSelected = parseFidDays(facultyEdit.fid).includes(option.value);
                              return (
                                <label
                                  key={`fid-option-${option.value}`}
                                  className="flex items-center justify-between px-2.5 py-2 rounded-md border border-slate-200 hover:border-blue-300 cursor-pointer"
                                >
                                  <span className="text-sm text-slate-700">{option.label}</span>
                                  <span className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleFidDay(option.value)}
                                      className="h-4 w-4 accent-blue-600"
                                    />
                                    {isSelected && <Check size={14} className="text-blue-600" />}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </details>
                        <div className="text-xs text-slate-500">
                          Selected days are auto-blocked for roster assignment.
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-900 font-semibold">{selectedFaculty.fid}</p>
                    )}
                  </div>
                )}

                <div className="theme-panel rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-600 font-medium mb-2">
                    <ClipboardList size={18} />
                    {isEditingFaculty ? 'Faculty Details' : 'Duty Statistics'}
                  </div>
                  {isEditingFaculty ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Designation</label>
                        <input
                          type="text"
                          value={facultyEdit.designation}
                          onChange={(e) => setFacultyEdit(v => ({ ...v, designation: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Short Name</label>
                        <input
                          type="text"
                          value={facultyEdit.shortName}
                          onChange={(e) => setFacultyEdit(v => ({ ...v, shortName: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Gender</label>
                        <select
                          value={facultyEdit.gender}
                          onChange={(e) => setFacultyEdit(v => ({ ...v, gender: e.target.value as '' | 'Male' | 'Female' }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        >
                          <option value="">Unspecified</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Faculty Shift</label>
                        <select
                          value={facultyEdit.facultyShift}
                          onChange={(e) => setFacultyEdit(v => ({ ...v, facultyShift: e.target.value as '' | 'Morning' | 'Day' }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        >
                          <option value="">Unspecified</option>
                          <option value="Morning">Morning</option>
                          <option value="Day">Day</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Unavailable</label>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                ref={unavailableDateInputRef}
                                type="date"
                                value={unavailableDateInput}
                                onChange={(e) => setUnavailableDateInput(e.target.value)}
                                className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm no-native-calendar-icon"
                                style={{ colorScheme: theme === 'dark' || theme === 'nord' || theme === 'forest' ? 'dark' : 'light' }}
                              />
                              <button
                                type="button"
                                onClick={() => unavailableDateInputRef.current?.showPicker?.()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-600"
                                aria-label="Open calendar"
                              >
                                <Calendar size={14} />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={addUnavailableDate}
                              className="px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium"
                            >
                              Add
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {parseUnavailableDates(facultyEdit.unavailable).length === 0 ? (
                              <span className="text-xs text-slate-500">No blocked dates selected</span>
                            ) : (
                              parseUnavailableDates(facultyEdit.unavailable).map((dateValue) => (
                                <span
                                  key={`unavailable-${dateValue}`}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium"
                                >
                                  {new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                  <button
                                    type="button"
                                    onClick={() => removeUnavailableDate(dateValue)}
                                    className="text-amber-700 hover:text-amber-900"
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-slate-500">Short Name</div>
                          <div className="text-slate-900 font-medium">{selectedFaculty.shortName || '-'}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Gender</div>
                          <div className="text-slate-900 font-medium">{selectedFaculty.gender || 'Unspecified'}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Faculty Shift</div>
                          <div className="text-slate-900 font-medium">{getFacultyShiftLabel(selectedFaculty) || 'Unspecified'}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-sm mb-1">Unavailable Dates</div>
                        <div className="flex flex-wrap gap-2">
                          {parseUnavailableDates(selectedFaculty.unavailable || '').length === 0 ? (
                            <span className="text-xs text-slate-500">None</span>
                          ) : (
                            parseUnavailableDates(selectedFaculty.unavailable || '').map(dateValue => (
                              <span
                                key={`view-unavailable-${dateValue}`}
                                className="inline-flex items-center px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium"
                              >
                                {new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      <p className="text-slate-900">
                        <span className="font-bold text-2xl text-blue-600">{selectedFaculty.dutyCount}</span>
                        <span className="text-slate-600 ml-2">total duties assigned</span>
                      </p>
                    </div>
                  )}
                </div>

                {!isEditingFaculty && (
                <div className="theme-panel border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-amber-700 font-medium mb-3">
                    <History size={18} />
                    Duty History
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {getDutyHistoryByFaculty(selectedFaculty.id).length === 0 ? (
                      <p className="text-sm text-slate-600">No duty history yet</p>
                    ) : (
                      getDutyHistoryByFaculty(selectedFaculty.id).map(history => (
                        <div key={history.id} className="text-sm theme-card rounded p-2 border border-slate-200">
                          <div className="flex justify-between">
                            <span className="font-semibold text-slate-700">
                              {formatISODateLocal(history.date, 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            <span className="text-slate-600">
                              Shift {history.shift} - {history.role === 'supervisor' ? 'Supervisor' : `Room ${history.roomNo}`}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (viewMode === 'about') {
    return (
      <div className="min-h-screen theme-root relative" data-theme={theme}>
        <header className="theme-header border-b sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-8 w-full md:w-auto">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">VIC Duty Roster</h1>
                <nav className="flex flex-wrap gap-1">
                  <button onClick={() => setViewMode('dashboard')} className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2">
                    <LayoutDashboard size={18} />Dashboard
                  </button>
                  <button onClick={() => setViewMode('roster')} className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2">
                    <ClipboardList size={18} />Duty Roster
                  </button>
                  <button onClick={() => setViewMode('directory')} className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2">
                    <Users size={18} />Faculty Directory
                  </button>
                  <button onClick={() => setViewMode('about')} className="px-4 py-2 rounded-lg bg-blue-100 text-blue-700 font-medium flex items-center gap-2">
                    <Info size={18} />Documentation
                  </button>
                </nav>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <select value={theme} onChange={(e) => setTheme(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="nord">Nord</option>
                  <option value="forest">Forest</option>
                  <option value="solar">Solar</option>
                  <option value="cool">Cool</option>
                  <option value="latte">Latte</option>
                </select>
                <button onClick={handleLogout} className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium">
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-8 space-y-6">

          {/* Header */}
          <section className="theme-card rounded-2xl p-6 border border-blue-200/40">
            <div className="flex items-center gap-4 mb-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-lg shadow-lg">
                VIC
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Duty Roster System</h1>
                <p className="text-slate-500 text-sm mt-0.5">User Guide & Documentation</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed max-w-3xl">
              The VIC Duty Roster System streamlines examination duty allocation at Victoria Institution (College) — replacing manual spreadsheets with intelligent, availability-aware scheduling and fair workload tracking.
            </p>
          </section>

          {/* Quick Start */}
          <section className="theme-card rounded-2xl p-6 border border-blue-200/30">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Calendar size={20} className="text-blue-600" />
              Quick Start — 7 Steps
            </h2>
            <div className="space-y-3">
              {ABOUT_SECTIONS.quickStart.map((item) => (
                <div key={item.step} className="theme-panel rounded-lg p-4 border border-slate-200 flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">
                    {item.step}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{item.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{item.what}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Module Overview */}
          <section className="theme-card rounded-2xl p-6 border border-blue-200/30">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <LayoutDashboard size={20} className="text-blue-600" />
              Module Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="theme-panel rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardList size={16} className="text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Duty Roster</h3>
                </div>
                <p className="text-xs text-slate-600 mb-3">{ABOUT_SECTIONS.dutyRosterModule.overview}</p>
                <ul className="space-y-1">
                  {ABOUT_SECTIONS.dutyRosterModule.features.map(f => (
                    <li key={f.name} className="text-xs text-slate-700 flex gap-1.5">
                      <span className="text-blue-500 font-bold mt-0.5 flex-shrink-0">›</span>
                      <span><span className="font-semibold">{f.name}:</span> {f.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="theme-panel rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={16} className="text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Faculty Directory</h3>
                </div>
                <p className="text-xs text-slate-600 mb-3">{ABOUT_SECTIONS.facultyDirectoryModule.overview}</p>
                <ul className="space-y-1">
                  {ABOUT_SECTIONS.facultyDirectoryModule.features.map(f => (
                    <li key={f.name} className="text-xs text-slate-700 flex gap-1.5">
                      <span className="text-emerald-500 font-bold mt-0.5 flex-shrink-0">›</span>
                      <span><span className="font-semibold">{f.name}:</span> {f.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="theme-panel rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} className="text-violet-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Dashboard</h3>
                </div>
                <p className="text-xs text-slate-600 mb-3">{ABOUT_SECTIONS.dashboardModule.overview}</p>
                <ul className="space-y-1">
                  {ABOUT_SECTIONS.dashboardModule.features.map(f => (
                    <li key={f.name} className="text-xs text-slate-700 flex gap-1.5">
                      <span className="text-violet-500 font-bold mt-0.5 flex-shrink-0">›</span>
                      <span><span className="font-semibold">{f.name}:</span> {f.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Best Practices & Troubleshooting */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="theme-card rounded-2xl p-6 border border-amber-300/40">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <TrendingUp size={20} className="text-amber-600" />
                Best Practices
              </h2>
              <ul className="space-y-2">
                {ABOUT_SECTIONS.bestPractices.map((practice, idx) => (
                  <li key={idx} className="flex gap-2 text-xs text-slate-700 leading-relaxed">
                    <span className="text-amber-600 font-bold flex-shrink-0">{idx + 1}.</span>
                    <span>{practice}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="theme-card rounded-2xl p-6 border border-red-200/40">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <AlertCircle size={20} className="text-red-600" />
                Troubleshooting
              </h2>
              <div className="space-y-3">
                {ABOUT_SECTIONS.troubleshooting.map((item, idx) => (
                  <div key={idx} className="theme-panel rounded-lg p-3 border border-red-200/40">
                    <p className="text-xs font-semibold text-slate-800 mb-1">{item.problem}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.solution}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Glossary & Technical */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="theme-card glossary-section rounded-2xl p-6 border">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Glossary</h2>
              <div className="space-y-2">
                {ABOUT_SECTIONS.glossary.map((item) => (
                  <div key={item.term} className="theme-panel glossary-item rounded-lg p-3 border">
                    <span className="glossary-term font-bold text-xs">{item.term}: </span>
                    <span className="text-xs text-slate-700">{item.definition}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="space-y-6">
              <section className="theme-card rounded-2xl p-6 border border-slate-200">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Technical Details</h2>
                <div className="space-y-3">
                  <div><p className="text-xs font-semibold text-slate-700 mb-0.5">Data Storage</p><p className="text-xs text-slate-600">{ABOUT_SECTIONS.technicalDetails.storage}</p></div>
                  <div><p className="text-xs font-semibold text-slate-700 mb-0.5">Browser Compatibility</p><p className="text-xs text-slate-600">{ABOUT_SECTIONS.technicalDetails.compatibility}</p></div>
                  <div><p className="text-xs font-semibold text-slate-700 mb-0.5">Performance</p><p className="text-xs text-slate-600">{ABOUT_SECTIONS.technicalDetails.performance}</p></div>
                  <div><p className="text-xs font-semibold text-slate-700 mb-0.5">Security & Privacy</p><p className="text-xs text-slate-600">{ABOUT_SECTIONS.technicalDetails.security}</p></div>
                </div>
              </section>

              <section className="theme-card rounded-2xl p-6 border border-slate-200">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Advanced Features</h2>
                <div className="space-y-2">
                  {ABOUT_SECTIONS.advancedFeatures.map((f) => (
                    <div key={f.name} className="theme-panel rounded-lg p-3 border border-slate-200">
                      <p className="text-xs font-semibold text-slate-800 mb-0.5">{f.name}</p>
                      <p className="text-xs text-slate-600">{f.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {/* Footer */}
          <section className="theme-card rounded-2xl p-6 border border-slate-200 text-center">
            <p className="text-sm text-slate-600 mb-2">
              Developed by <span className="font-semibold text-slate-900">Dr. Mainul Hossain</span> with assistance from AI technology
            </p>
            <div className="flex flex-wrap gap-2 justify-center text-xs text-slate-500">
              <span>Version 1.0.0</span><span>•</span>
              <span>Released February 2026</span><span>•</span>
              <span>Built with Next.js & React</span>
            </div>
          </section>

        </div>
      </div>
    );
  }

  // Duty Roster View with Drag-Drop
  return (
    <div className="min-h-screen theme-root" data-theme={theme}>
      <header className="theme-header border-b sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-8 w-full md:w-auto">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">VIC Duty Roster</h1>
              <nav className="flex flex-wrap gap-1">
                <button
                  onClick={() => setViewMode('dashboard')}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                >
                  <LayoutDashboard size={18} />
                  Dashboard
                </button>
                <button
                  onClick={() => setViewMode('roster')}
                  className="px-4 py-2 rounded-lg bg-blue-100 text-blue-700 font-medium flex items-center gap-2"
                >
                  <ClipboardList size={18} />
                  Duty Roster
                </button>
                <button
                  onClick={() => setViewMode('directory')}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                >
                  <Users size={18} />
                  Faculty Directory
                </button>
                <button
                  onClick={() => setViewMode('about')}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                >
                  <Info size={18} />
                  About
                </button>
              </nav>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="nord">Nord</option>
                <option value="forest">Forest</option>
                <option value="solar">Solar</option>
                <option value="cool">Cool</option>
                <option value="latte">Latte</option>
              </select>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium"
              >
                Logout
              </button>
            </div>
            </div>
          </div>
        </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-8">
        <div className="theme-card rounded-xl shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Exam Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Course</label>
              <input
                type="text"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Semester</label>
              <input
                type="text"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Year of Exam</label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g., 2025"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Curriculum</label>
              <select
                value={curriculum}
                onChange={(e) => setCurriculum(e.target.value as 'CCF' | 'CBCS')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="CCF">CCF</option>
                <option value="CBCS">CBCS</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Shift Mode</label>
              <select
                value={shiftMode}
                onChange={(e) => setShiftMode(e.target.value as any)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="both">Both Shifts</option>
                <option value="forenoon">Forenoon Only</option>
                <option value="afternoon">Afternoon Only</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {shiftMode !== 'afternoon' && (
              <ShiftCard
                shiftNumber={1}
                title="Shift 1 - Forenoon"
                time={time1}
                setTime={setTime1}
                supervisor={super1}
                setSupervisor={(value) => handleSupervisorChange(1, value)}
                availableSupervisors={availForSuper1}
                rooms={rooms1}
                setRooms={setRooms1}
                addRoom={() => addRoom(1)}
                removeRoom={(id) => removeRoom(1, id)}
                updateRoom={(id, field, value) => updateRoom(1, id, field, value)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDropOnSlot={(roomId, slotId) => handleDropOnSlot(1, roomId, slotId)}
                onSelectSlotFaculty={(roomId, slotId, facultyName) => handleSelectSlotFaculty(1, roomId, slotId, facultyName)}
                removeFromSlot={(roomId, slotId) => removeFromSlot(1, roomId, slotId)}
                assignedFaculty={takenByShift1}
                compactMode={isCompactScreen}
                slotFacultyOptions={slotOptions1}
                facultyByName={facultyByName}
              />
            )}

            {shiftMode !== 'forenoon' && (
              <ShiftCard
                shiftNumber={2}
                title="Shift 2 - Afternoon"
                time={time2}
                setTime={setTime2}
                supervisor={super2}
                setSupervisor={(value) => handleSupervisorChange(2, value)}
                availableSupervisors={availForSuper2}
                rooms={rooms2}
                setRooms={setRooms2}
                addRoom={() => addRoom(2)}
                removeRoom={(id) => removeRoom(2, id)}
                updateRoom={(id, field, value) => updateRoom(2, id, field, value)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDropOnSlot={(roomId, slotId) => handleDropOnSlot(2, roomId, slotId)}
                onSelectSlotFaculty={(roomId, slotId, facultyName) => handleSelectSlotFaculty(2, roomId, slotId, facultyName)}
                removeFromSlot={(roomId, slotId) => removeFromSlot(2, roomId, slotId)}
                assignedFaculty={takenByShift2}
                compactMode={isCompactScreen}
                slotFacultyOptions={slotOptions2}
                facultyByName={facultyByName}
              />
            )}

            <div className="theme-card rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Roster Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {shiftMode !== 'afternoon' && (
                  <div className="theme-panel rounded-lg p-4">
                    <div className="text-sm font-semibold text-slate-800 mb-2">Shift 1</div>
                    <div className="text-sm text-slate-600">Rooms: <span className="font-semibold text-slate-900">{summary1.roomCount}</span></div>
                    <div className="text-sm text-slate-600">Students: <span className="font-semibold text-slate-900">{summary1.students}</span></div>
                    <div className="text-sm text-slate-600">Invigilator Slots: <span className="font-semibold text-slate-900">{summary1.filledSlots}/{summary1.slots}</span></div>
                    <div className="text-sm text-slate-600">Supervisor: <span className="font-semibold text-slate-900">{summary1.supervisorAssigned ? 'Assigned' : 'Pending'}</span></div>
                  </div>
                )}
                {shiftMode !== 'forenoon' && (
                  <div className="theme-panel rounded-lg p-4">
                    <div className="text-sm font-semibold text-slate-800 mb-2">Shift 2</div>
                    <div className="text-sm text-slate-600">Rooms: <span className="font-semibold text-slate-900">{summary2.roomCount}</span></div>
                    <div className="text-sm text-slate-600">Students: <span className="font-semibold text-slate-900">{summary2.students}</span></div>
                    <div className="text-sm text-slate-600">Invigilator Slots: <span className="font-semibold text-slate-900">{summary2.filledSlots}/{summary2.slots}</span></div>
                    <div className="text-sm text-slate-600">Supervisor: <span className="font-semibold text-slate-900">{summary2.supervisorAssigned ? 'Assigned' : 'Pending'}</span></div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="theme-card rounded-xl shadow-sm p-6 lg:sticky lg:top-24">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="font-bold text-slate-900 flex items-center gap-2">
                  <Users size={20} />
                  Available Faculty ({visibleAvailableFaculty.length})
                </h2>
                <button
                  onClick={() => setAvailableSearchOpen(v => !v)}
                  className="inline-flex items-center justify-center p-2 rounded-lg border border-slate-300 text-slate-600 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  title="Search available faculty"
                  aria-label="Search available faculty"
                >
                  <Search size={16} />
                </button>
              </div>
              {availableSearchOpen && (
                <div className="mb-3">
                  <input
                    type="text"
                    value={availableSearchTerm}
                    onChange={(e) => setAvailableSearchTerm(e.target.value)}
                    placeholder="Search by name, department, designation, ID..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              )}
              
              <div className="text-sm text-slate-600 mb-4">
                Faculty available on {formatISODateLocal(selectedDate, 'en-GB', { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>

              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-medium text-slate-600">Allow repeat duty</label>
                <button
                  onClick={() => setAllowRepeatDuty(v => !v)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    allowRepeatDuty
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {allowRepeatDuty ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Sort by</label>
                  <select
                    value={availableSortBy}
                    onChange={(e) => setAvailableSortBy(e.target.value as FacultySortBy)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="name">Name</option>
                    <option value="department">Department</option>
                    <option value="designation">Designation</option>
                    <option value="dutyCount">Duty Count</option>
                    <option value="fid">FID</option>
                    <option value="shift">Shift</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Order</label>
                  <select
                    value={availableSortOrder}
                    onChange={(e) => setAvailableSortOrder(e.target.value as SortOrder)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {isCompactScreen && (
                  <div className="text-xs rounded-lg px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200">
                    Assign invigilators directly from each room slot dropdown.
                  </div>
                )}
                {visibleAvailableFaculty.length === 0 ? (
                  <p className="text-center py-8 text-slate-500">No faculty available for this date</p>
                ) : (
                  <>
                    {visibleAvailableFaculty.map(faculty => (
                      <div
                        key={`avail-${faculty.id}`}
                        draggable={!isCompactScreen}
                        onDragStart={(e) => handleDragStart(e, { type: 'faculty', facultyName: faculty.name })}
                        className={`theme-panel available-faculty-card px-4 py-3 rounded-xl transition-all group border border-slate-200 ${isCompactScreen ? '' : 'cursor-move'}`}
                      >
                        <div className="flex items-start gap-3">
                          <GripVertical size={15} className="mt-1 text-slate-400 group-hover:text-blue-500" />
                          <div className="flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="font-semibold text-slate-900 text-[18px] leading-tight group-hover:text-blue-700">
                                {faculty.name}
                              </div>
                              <div className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-300 whitespace-nowrap">
                                Duties {faculty.dutyCount || 0}
                              </div>
                            </div>
                            <div className="text-sm text-slate-600 mt-1">{faculty.department}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {faculty.gender && (
                                <div className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                  faculty.gender === 'Female'
                                    ? 'text-slate-700 bg-slate-100 border-slate-300'
                                    : 'text-blue-700 bg-blue-100 border-blue-200'
                                }`}>
                                  {faculty.gender === 'Female' ? <UserCircle2 size={11} /> : <User size={11} />}
                                  {faculty.gender}
                                </div>
                              )}
                              {getFacultyShiftLabel(faculty) && (
                                <div className="text-[11px] font-semibold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">
                                  {getFacultyShiftLabel(faculty)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-slate-200">
                <button
                  onClick={handlePreviewAndPrint}
                  disabled={!canGenerate}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white text-blue-700 border border-blue-300 rounded-lg font-medium hover:bg-blue-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed transition-colors"
                >
                  <Printer size={18} />
                  Preview & Print
                </button>
                <button
                  onClick={handleSaveAndPrint}
                  disabled={!canGenerate}
                  className="w-full mt-3 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-600/30"
                >
                  <Printer size={18} />
                  Save & Print
                </button>
                
                {!canGenerate && (
                  <div className="mt-3 flex items-start gap-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>Fill all room slots and select supervisors to generate the duty chart</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Shift Card Component
function ShiftCard({
  shiftNumber,
  title,
  time,
  setTime,
  supervisor,
  setSupervisor,
  availableSupervisors,
  rooms,
  setRooms,
  addRoom,
  removeRoom,
  updateRoom,
  onDragStart,
  onDragOver,
  onDropOnSlot,
  onSelectSlotFaculty,
  removeFromSlot,
  assignedFaculty,
  compactMode,
  slotFacultyOptions,
  facultyByName
}: {
  shiftNumber: number;
  title: string;
  time: string;
  setTime: (v: string) => void;
  supervisor: string;
  setSupervisor: (v: string) => void;
  availableSupervisors: Faculty[];
  rooms: Room[];
  setRooms: (rooms: Room[]) => void;
  addRoom: () => void;
  removeRoom: (id: number) => void;
  updateRoom: (id: number, field: keyof Room, value: string) => void;
  onDragStart: (e: React.DragEvent, item: DragItem) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDropOnSlot: (roomId: number, slotId: string) => void;
  onSelectSlotFaculty: (roomId: number, slotId: string, facultyName: string) => void;
  removeFromSlot: (roomId: number, slotId: string) => void;
  assignedFaculty: Set<string>;
  compactMode: boolean;
  slotFacultyOptions: Faculty[];
  facultyByName: Map<string, Faculty>;
}) {
  const totalSlots = rooms.reduce((sum, r) => sum + r.slots.length, 0);
  const filledSlots = rooms.reduce((sum, r) => sum + r.slots.filter(s => s.facultyName).length, 0);
  const selectedSupervisor = supervisor ? facultyByName.get(supervisor) : undefined;
  const supervisorShiftLabel = getFacultyShiftLabel(selectedSupervisor);
  const showSupervisorShift2Warning = shiftNumber === 2 && isMorningFaculty(selectedSupervisor);

  return (
    <div className="theme-card rounded-xl shadow-sm p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600 mt-1">{shiftNumber === 1 ? 'Morning examination shift' : 'Afternoon examination shift'}</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
          <UserCheck size={16} />
          {filledSlots}/{totalSlots} Slots
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Time Slot</label>
          <input
            type="text"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Supervisor</label>
          <select
            value={supervisor}
            onChange={(e) => setSupervisor(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">Select Supervisor</option>
            {availableSupervisors.map(f => (
              <option key={f.id} value={f.name}>
                {f.name}{getFacultyShiftLabel(f) ? ` (${getFacultyShiftLabel(f)})` : ''}
              </option>
            ))}
          </select>
          {supervisor && supervisorShiftLabel && (
            <div className="mt-2 text-xs text-slate-600">
              Selected supervisor shift: <span className="font-semibold">{supervisorShiftLabel}</span>
            </div>
          )}
          {showSupervisorShift2Warning && (
            <div className="duty-warning mt-2 flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5">
              <AlertCircle size={13} />
              Morning teacher selected for Shift 2 (Afternoon).
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Examination Rooms</h3>
        </div>

        {rooms.map((room) => {
          const roomAssignedFaculty = room.slots
            .map(slot => (slot.facultyName ? facultyByName.get(slot.facultyName) : undefined))
            .filter((f): f is Faculty => Boolean(f));
          const allRoomInvigilatorsMale =
            room.slots.length > 0 &&
            roomAssignedFaculty.length === room.slots.length &&
            roomAssignedFaculty.every(f => f.gender === 'Male');
          return (
          <div key={room.id} className="room-card border-2 rounded-lg p-4 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                    <DoorOpen size={14} className="text-blue-500" />
                    Room No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 02"
                    value={room.roomNo}
                    onChange={(e) => updateRoom(room.id, 'roomNo', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                    <Users size={14} className="text-green-500" />
                    Students
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 24"
                    value={room.students}
                    onChange={(e) => updateRoom(room.id, 'students', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                    <UserCheck size={14} className="text-purple-500" />
                    Invigilators
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 2"
                    value={room.invigilators}
                    onChange={(e) => updateRoom(room.id, 'invigilators', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
              </div>
              <button
                onClick={() => removeRoom(room.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors self-end sm:self-auto sm:mt-5"
              >
                <Trash2 size={18} />
              </button>
            </div>
            {allRoomInvigilatorsMale && (
              <div className="duty-warning mb-4 flex items-center gap-2 text-xs rounded-md px-3 py-2">
                <AlertCircle size={13} />
                All invigilators in this room are male. Please assign at least one female teacher.
              </div>
            )}

            {/* Invigilator Slots */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Invigilator Slots</div>
              {room.slots.map((slot, idx) => {
                const selectedFaculty = slot.facultyName ? facultyByName.get(slot.facultyName) : undefined;
                const slotShiftLabel = getFacultyShiftLabel(selectedFaculty);
                const showShift2Warning = shiftNumber === 2 && isMorningFaculty(selectedFaculty);
                return (
                <div
                  key={slot.id}
                  onDragOver={onDragOver}
                  onDrop={() => onDropOnSlot(room.id, slot.id)}
                  className={`relative border-2 border-dashed rounded-lg p-3 transition-all ${
                    slot.facultyName 
                      ? 'slot-assigned' 
                      : 'slot-empty'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="slot-number w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </div>
                      {compactMode ? (
                        <select
                          value={slot.facultyName || ''}
                          onChange={(e) => onSelectSlotFaculty(room.id, slot.id, e.target.value)}
                          className="min-w-[220px] w-full max-w-xs px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white"
                        >
                          <option value="">Select Invigilator</option>
                          {slotFacultyOptions.map(f => (
                            <option key={`slot-option-${room.id}-${slot.id}-${f.id}`} value={f.name}>
                              {f.name}{getFacultyShiftLabel(f) ? ` (${getFacultyShiftLabel(f)})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : slot.facultyName ? (
                        <div
                          draggable
                          onDragStart={(e) => onDragStart(e, {
                            type: 'faculty',
                            facultyName: slot.facultyName!,
                            sourceShift: shiftNumber,
                            sourceRoomId: room.id,
                            sourceSlotId: slot.id
                          })}
                          className="flex items-center gap-2 cursor-move"
                        >
                          <GripVertical size={14} className="text-blue-400" />
                          <span className="slot-name font-medium text-sm">{slot.facultyName}</span>
                          {slotShiftLabel && (
                            <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                              {slotShiftLabel}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="slot-placeholder text-sm italic">Drag faculty here...</span>
                      )}
                    </div>
                    {slot.facultyName && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromSlot(room.id, slot.id);
                        }}
                        className="slot-remove-btn p-1 rounded transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  {slot.facultyName && showShift2Warning && (
                    <div className="duty-warning mt-2 flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1">
                      <AlertCircle size={12} />
                      Morning teacher selected for Shift 2 (Afternoon).
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
          );
        })}

        <div className="pt-2 flex justify-end">
          <button
            onClick={addRoom}
            className="add-room-btn w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Add Room
          </button>
        </div>
      </div>
    </div>
  );
}


