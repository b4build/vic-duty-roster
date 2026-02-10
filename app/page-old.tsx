"use client";
import React, { useState, useEffect } from 'react';
import { Calendar, Users, Printer, Trash2, Plus, Search, Filter, X, ChevronDown, Clock, Building2, UserCircle2, Mail, Phone, BookOpen, AlertCircle, CheckCircle2, Download, FileText, Settings, Menu, Home, ClipboardList } from 'lucide-react';
import { getAvailableFaculty } from '@/lib/roster-utils';
import facultyData from '@/lib/faculty-data.json';

interface Faculty {
  id: string;
  name: string;
  department: string;
  designation: string;
  fid: string;
  dutyCount: number;
  shortName?: string;
  unavailable?: string;
}

interface Room {
  id: number;
  roomNo: string;
  students: string;
  invigilators: string;
}

type ViewMode = 'roster' | 'directory';

export default function DutyRoster() {
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('roster');
  
  // Faculty Directory states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  
  // Roster states
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableFaculty, setAvailableFaculty] = useState<Faculty[]>([]);
  const [isPrintMode, setIsPrintMode] = useState(false);
  
  // Form fields
  const [course, setCourse] = useState('B.A. / B.Sc. / B.Com.');
  const [semester, setSemester] = useState('SEM V');
  const [year, setYear] = useState('2025');
  const [curriculum, setCurriculum] = useState('Under CCF');
  const [shiftMode, setShiftMode] = useState('both');
  
  // Shift 1
  const [time1, setTime1] = useState('Morning (10 AM Onwards)');
  const [super1, setSuper1] = useState('');
  const [rooms1, setRooms1] = useState<Room[]>([
    { id: 1, roomNo: '02', students: '24', invigilators: '2' },
    { id: 2, roomNo: '06', students: '30', invigilators: '2' }
  ]);
  const [selected1, setSelected1] = useState<string[]>([]);
  
  // Shift 2
  const [time2, setTime2] = useState('Afternoon (2 PM Onwards)');
  const [super2, setSuper2] = useState('');
  const [rooms2, setRooms2] = useState<Room[]>([
    { id: 3, roomNo: '18', students: '23', invigilators: '2' }
  ]);
  const [selected2, setSelected2] = useState<string[]>([]);

  useEffect(() => {
    const filtered = getAvailableFaculty(selectedDate);
    setAvailableFaculty(filtered);
  }, [selectedDate]);

  // Get unique departments
  const departments = ['all', ...Array.from(new Set(facultyData.map(f => f.department)))];

  // Filter faculty for directory
  const filteredFaculty = facultyData.filter(faculty => {
    const matchesSearch = faculty.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         faculty.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         faculty.designation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = selectedDepartment === 'all' || faculty.department === selectedDepartment;
    return matchesSearch && matchesDepartment;
  });

  const need1 = rooms1.reduce((sum, r) => sum + parseInt(r.invigilators || '0'), 0);
  const need2 = rooms2.reduce((sum, r) => sum + parseInt(r.invigilators || '0'), 0);

  // Available pools (excluding selected from other shift & supervisors)
  const takenByShift1 = new Set([super1, ...selected1]);
  const takenByShift2 = new Set([super2, ...selected2]);
  
  const availForSuper1 = availableFaculty.filter(f => !takenByShift2.has(f.name));
  const availForSuper2 = availableFaculty.filter(f => !takenByShift1.has(f.name));
  const availForShift1 = availableFaculty.filter(f => !takenByShift1.has(f.name) && !takenByShift2.has(f.name));
  const availForShift2 = availableFaculty.filter(f => !takenByShift2.has(f.name) && !takenByShift1.has(f.name));

  const canGenerate = 
    (shiftMode !== 'afternoon' ? selected1.length === need1 && super1 : true) &&
    (shiftMode !== 'forenoon' ? selected2.length === need2 && super2 : true);

  const addRoom = (shift: 1 | 2) => {
    const newRoom = { id: Date.now(), roomNo: '', students: '', invigilators: '1' };
    if (shift === 1) setRooms1([...rooms1, newRoom]);
    else setRooms2([...rooms2, newRoom]);
  };

  const removeRoom = (shift: 1 | 2, id: number) => {
    if (shift === 1) setRooms1(rooms1.filter(r => r.id !== id));
    else setRooms2(rooms2.filter(r => r.id !== id));
  };

  const updateRoom = (shift: 1 | 2, id: number, field: keyof Room, value: string) => {
    if (shift === 1) {
      setRooms1(rooms1.map(r => r.id === id ? { ...r, [field]: value } : r));
    } else {
      setRooms2(rooms2.map(r => r.id === id ? { ...r, [field]: value } : r));
    }
  };

  const moveToSelected = (shift: 1 | 2, names: string[]) => {
    if (shift === 1) {
      const newSelected = [...selected1];
      names.forEach(name => {
        if (!newSelected.includes(name) && newSelected.length < need1) {
          newSelected.push(name);
        }
      });
      setSelected1(newSelected);
    } else {
      const newSelected = [...selected2];
      names.forEach(name => {
        if (!newSelected.includes(name) && newSelected.length < need2) {
          newSelected.push(name);
        }
      });
      setSelected2(newSelected);
    }
  };

  const removeFromSelected = (shift: 1 | 2, names: string[]) => {
    if (shift === 1) {
      setSelected1(selected1.filter(n => !names.includes(n)));
    } else {
      setSelected2(selected2.filter(n => !names.includes(n)));
    }
  };

  const handleGenerate = () => {
    const allocation1 = allocateInvigilators(rooms1, selected1);
    const allocation2 = allocateInvigilators(rooms2, selected2);
    
    console.log('Shift 1:', { super: super1, allocation: allocation1 });
    console.log('Shift 2:', { super: super2, allocation: allocation2 });
    
    setIsPrintMode(true);
  };

  const allocateInvigilators = (rooms: Room[], selected: string[]) => {
    let index = 0;
    return rooms.map(room => {
      const needed = parseInt(room.invigilators || '0');
      const assigned = selected.slice(index, index + needed);
      index += needed;
      return { ...room, assignedInvigilators: assigned };
    });
  };

  // Print Mode
  if (isPrintMode) {
    const allocation1 = allocateInvigilators(rooms1, selected1);
    const allocation2 = allocateInvigilators(rooms2, selected2);
    
    return (
      <div className="min-h-screen bg-white p-8">
        <div className="print:hidden mb-8 flex gap-4 items-center">
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
            <Printer size={18} /> Print / Save PDF
          </button>
        </div>

        <div className="max-w-4xl mx-auto border-2 border-slate-900 p-8 font-serif bg-white shadow-2xl">
          <div className="text-center mb-8 border-b-2 border-slate-900 pb-6">
            <h1 className="text-3xl font-bold uppercase tracking-wide">Victoria Institution (College)</h1>
            <h2 className="text-2xl font-bold mt-3 text-slate-700">Invigilation Duty Chart</h2>
            <div className="mt-4 space-y-1">
              <p className="text-lg font-semibold">
                {course} {semester} {year} ({curriculum})
              </p>
              <p className="text-base">
                <span className="font-semibold">Date:</span> {new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}
              </p>
            </div>
          </div>

          {shiftMode !== 'afternoon' && (
            <div className="mb-8">
              <h3 className="text-xl font-bold text-center mb-3 bg-slate-100 py-2">Shift 1 (Forenoon)</h3>
              <div className="text-center mb-4 space-y-1">
                <p><span className="font-semibold">Time:</span> {time1}</p>
                <p><span className="font-semibold">Supervisor:</span> {super1 || '—'}</p>
              </div>
              
              <table className="w-full border-collapse border-2 border-slate-900">
                <thead>
                  <tr className="bg-slate-200">
                    <th className="border-2 border-slate-900 p-3 font-bold text-left">Room No.</th>
                    <th className="border-2 border-slate-900 p-3 font-bold text-center">Students</th>
                    <th className="border-2 border-slate-900 p-3 font-bold text-left">Invigilators</th>
                    <th className="border-2 border-slate-900 p-3 font-bold text-center w-32">Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation1.map((room: any) => (
                    <tr key={room.id} className="hover:bg-slate-50">
                      <td className="border-2 border-slate-900 p-3 text-center font-bold">{room.roomNo}</td>
                      <td className="border-2 border-slate-900 p-3 text-center">{room.students}</td>
                      <td className="border-2 border-slate-900 p-3">{room.assignedInvigilators.join(', ') || '—'}</td>
                      <td className="border-2 border-slate-900 p-3"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {shiftMode !== 'forenoon' && (
            <div className="mb-8">
              <h3 className="text-xl font-bold text-center mb-3 bg-slate-100 py-2">Shift 2 (Afternoon)</h3>
              <div className="text-center mb-4 space-y-1">
                <p><span className="font-semibold">Time:</span> {time2}</p>
                <p><span className="font-semibold">Supervisor:</span> {super2 || '—'}</p>
              </div>
              
              <table className="w-full border-collapse border-2 border-slate-900">
                <thead>
                  <tr className="bg-slate-200">
                    <th className="border-2 border-slate-900 p-3 font-bold text-left">Room No.</th>
                    <th className="border-2 border-slate-900 p-3 font-bold text-center">Students</th>
                    <th className="border-2 border-slate-900 p-3 font-bold text-left">Invigilators</th>
                    <th className="border-2 border-slate-900 p-3 font-bold text-center w-32">Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation2.map((room: any) => (
                    <tr key={room.id} className="hover:bg-slate-50">
                      <td className="border-2 border-slate-900 p-3 text-center font-bold">{room.roomNo}</td>
                      <td className="border-2 border-slate-900 p-3 text-center">{room.students}</td>
                      <td className="border-2 border-slate-900 p-3">{room.assignedInvigilators.join(', ') || '—'}</td>
                      <td className="border-2 border-slate-900 p-3"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-16 flex justify-between px-8">
            <div className="text-center">
              <div className="w-48 border-t-2 border-slate-900 pt-1"></div>
              <p className="font-bold mt-2">Officer-in-Charge</p>
            </div>
            <div className="text-center">
              <div className="w-48 border-t-2 border-slate-900 pt-1"></div>
              <p className="font-bold mt-2">Principal</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Faculty Directory View
  if (viewMode === 'directory') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-8">
                <h1 className="text-2xl font-bold text-slate-900">VIC Faculty Hub</h1>
                <nav className="flex gap-1">
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
                </nav>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Search and Filter Bar */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
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
                  className="pl-10 pr-10 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white cursor-pointer min-w-[200px]"
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
            <div className="mt-4 flex items-center gap-4 text-sm text-slate-600">
              <span className="font-medium">
                Showing {filteredFaculty.length} of {facultyData.length} faculty members
              </span>
            </div>
          </div>

          {/* Faculty Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFaculty.map((faculty) => (
              <div
                key={faculty.id}
                onClick={() => setSelectedFaculty(faculty)}
                className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer group"
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
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Faculty Detail Modal */}
        {selectedFaculty && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedFaculty(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                  <button
                    onClick={() => setSelectedFaculty(null)}
                    className="text-white/80 hover:text-white transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                      <Building2 size={16} />
                      Department
                    </div>
                    <p className="text-slate-900 font-semibold">{selectedFaculty.department}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                      <UserCircle2 size={16} />
                      Faculty ID
                    </div>
                    <p className="text-slate-900 font-semibold">{selectedFaculty.id}</p>
                  </div>
                </div>

                {selectedFaculty.fid && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-700 font-medium mb-2">
                      <Clock size={18} />
                      Faculty Improvement Day (FID)
                    </div>
                    <p className="text-blue-900 font-semibold">{selectedFaculty.fid}</p>
                  </div>
                )}

                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-600 font-medium mb-2">
                    <ClipboardList size={18} />
                    Duty Statistics
                  </div>
                  <p className="text-slate-900">
                    <span className="font-bold text-2xl text-blue-600">{selectedFaculty.dutyCount}</span>
                    <span className="text-slate-600 ml-2">duties assigned</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Duty Roster View (Main View)
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <h1 className="text-2xl font-bold text-slate-900">VIC Faculty Hub</h1>
              <nav className="flex gap-1">
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
              </nav>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Top Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <label className="block text-sm font-medium text-slate-700 mb-2">Shift Mode</label>
              <select
                value={shiftMode}
                onChange={(e) => setShiftMode(e.target.value)}
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
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6"

        {/* Exam Basics */}
        <div className="bg-white rounded-2xl shadow-lg border-2 border-blue-100 p-6 mb-6">
          <h2 className="text-xl font-bold text-blue-900 mb-4">Exam Basics</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-semibold mb-2">Course Name</label>
              <input value={course} onChange={(e) => setCourse(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-2">Semester</label>
                <input value={semester} onChange={(e) => setSemester(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block font-semibold mb-2">Year</label>
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-lg" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-2">Curriculum Type</label>
              <select value={curriculum} onChange={(e) => setCurriculum(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-lg">
                <option value="Under CCF">Under CCF</option>
                <option value="Under CBCS">Under CBCS</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-2">Exam Date</label>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-2">Shifts</label>
              <select value={shiftMode} onChange={(e) => setShiftMode(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-lg">
                <option value="both">Both</option>
                <option value="forenoon">Forenoon only</option>
                <option value="afternoon">Afternoon only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Shift 1 */}
        {shiftMode !== 'afternoon' && (
          <ShiftSection
            title="Shift 1 (Forenoon)"
            time={time1}
            setTime={setTime1}
            supervisor={super1}
            setSupervisor={setSuper1}
            availableSupervisors={availForSuper1}
            rooms={rooms1}
            addRoom={() => addRoom(1)}
            removeRoom={(id) => removeRoom(1, id)}
            updateRoom={(id, field, value) => updateRoom(1, id, field, value)}
            need={need1}
            selected={selected1}
            availableFaculty={availForShift1}
            moveToSelected={(names) => moveToSelected(1, names)}
            removeFromSelected={(names) => removeFromSelected(1, names)}
            clearSelected={() => setSelected1([])}
          />
        )}

        {/* Shift 2 */}
        {shiftMode !== 'forenoon' && (
          <ShiftSection
            title="Shift 2 (Afternoon)"
            time={time2}
            setTime={setTime2}
            supervisor={super2}
            setSupervisor={setSuper2}
            availableSupervisors={availForSuper2}
            rooms={rooms2}
            addRoom={() => addRoom(2)}
            removeRoom={(id) => removeRoom(2, id)}
            updateRoom={(id, field, value) => updateRoom(2, id, field, value)}
            need={need2}
            selected={selected2}
            availableFaculty={availForShift2}
            moveToSelected={(names) => moveToSelected(2, names)}
            removeFromSelected={(names) => removeFromSelected(2, names)}
            clearSelected={() => setSelected2([])}
          />
        )}

        {/* Action Buttons */}
        <div className="flex gap-4 mt-6">
          <button 
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            Generate Roster
          </button>
          <button 
            onClick={() => {
              setSelected1([]);
              setSelected2([]);
              setSuper1('');
              setSuper2('');
            }}
            className="bg-slate-200 text-slate-700 px-8 py-4 rounded-xl font-bold hover:bg-slate-300"
          >
            Reset Selections
          </button>
        </div>

        {!canGenerate && (
          <p className="text-amber-600 font-semibold mt-4">
            ⚠️ Generate button disabled: {shiftMode !== 'afternoon' && selected1.length !== need1 ? `Shift 1 needs ${need1} invigilators (selected: ${selected1.length})` : ''} 
            {shiftMode !== 'forenoon' && selected2.length !== need2 ? ` Shift 2 needs ${need2} invigilators (selected: ${selected2.length})` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

// Shift Section Component
function ShiftSection({ title, time, setTime, supervisor, setSupervisor, availableSupervisors, rooms, addRoom, removeRoom, updateRoom, need, selected, availableFaculty, moveToSelected, removeFromSelected, clearSelected }: any) {
  const [multiSelect, setMultiSelect] = useState<string[]>([]);

  return (
    <div className="bg-white rounded-2xl shadow-lg border-2 border-blue-100 p-6 mb-6">
      <h2 className="text-xl font-bold text-blue-900 mb-4">{title}</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block font-semibold mb-2">Time label</label>
          <input value={time} onChange={(e) => setTime(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-lg" />
        </div>
        <div>
          <label className="block font-semibold mb-2">Supervisor</label>
          <select value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-lg">
            <option value="">-- Select Supervisor --</option>
            {availableSupervisors.map((f: Faculty) => (
              <option key={f.id} value={f.name}>{f.name} ({f.designation})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Rooms Table */}
      <div className="mb-6 bg-slate-50 rounded-xl p-4">
        <h3 className="font-bold mb-3">Rooms</h3>
        <table className="w-full">
          <thead>
            <tr className="text-left border-b-2 border-slate-300">
              <th className="p-2">Room No</th>
              <th className="p-2">Students</th>
              <th className="p-2">Invigilators Needed</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room: Room) => (
              <tr key={room.id} className="border-b border-slate-200">
                <td className="p-2">
                  <input value={room.roomNo} onChange={(e) => updateRoom(room.id, 'roomNo', e.target.value)} className="w-full p-2 border rounded" placeholder="02" />
                </td>
                <td className="p-2">
                  <input type="number" value={room.students} onChange={(e) => updateRoom(room.id, 'students', e.target.value)} className="w-full p-2 border rounded" placeholder="24" />
                </td>
                <td className="p-2">
                  <input type="number" value={room.invigilators} onChange={(e) => updateRoom(room.id, 'invigilators', e.target.value)} className="w-full p-2 border rounded" placeholder="2" />
                </td>
                <td className="p-2 text-right">
                  <button onClick={() => removeRoom(room.id)} className="text-red-600 hover:bg-red-50 px-3 py-1 rounded">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between items-center mt-4">
          <button onClick={addRoom} className="bg-slate-200 px-4 py-2 rounded-lg font-semibold hover:bg-slate-300 flex items-center gap-2">
            <Plus size={16} /> Add Room
          </button>
          <span className="font-bold">Total Invigilators Needed: {need}</span>
        </div>
      </div>

      {/* Teacher Selection */}
      <div className="bg-slate-50 rounded-xl p-4">
        <h3 className="font-bold mb-3">Teacher Selection</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Available */}
          <div>
            <label className="block font-semibold mb-2 text-slate-600">Available</label>
            <select 
              multiple 
              size={8} 
              className="w-full p-2 border-2 border-slate-300 rounded-lg"
              value={multiSelect}
              onChange={(e) => setMultiSelect(Array.from(e.target.selectedOptions, opt => opt.value))}
            >
              {availableFaculty.map((f: Faculty) => (
                <option key={f.id} value={f.name}>{f.name} ({f.dutyCount})</option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex flex-col justify-center gap-2">
            <button onClick={() => { moveToSelected(multiSelect); setMultiSelect([]); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2">
              Add <ArrowRight size={16} />
            </button>
            <button onClick={() => { moveToSelected(availableFaculty.slice(0, need - selected.length).map((f: Faculty) => f.name)); }} className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200">
              Add All
            </button>
            <button onClick={clearSelected} className="bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200">
              Clear
            </button>
          </div>

          {/* Selected */}
          <div>
            <label className="block font-semibold mb-2 text-slate-600">Selected ({selected.length})</label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-2 min-h-[200px] bg-white">
              {selected.map((name: string, idx: number) => (
                <div key={idx} className="flex justify-between items-center bg-blue-50 border border-blue-200 rounded p-2 mb-2">
                  <span className="text-sm font-semibold">{name}</span>
                  <button onClick={() => removeFromSelected([name])} className="text-red-600 hover:text-red-800">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-sm text-slate-600 mt-2">
          {selected.length === need ? '✅ Count matches!' : `⚠️ Need ${need}, selected ${selected.length}`}
        </p>
      </div>
    </div>
  );
}
