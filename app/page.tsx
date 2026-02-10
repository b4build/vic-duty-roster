"use client";
import React, { useState, useEffect } from 'react';
import { Calendar, Users, ClipboardCheck, Search, ShieldAlert, Printer, ArrowLeft, Trash2 } from 'lucide-react';
import { getAvailableFaculty } from '@/lib/roster-utils';

// --- Types ---
interface Faculty {
  id: string;
  name: string;
  department: string;
  designation: string;
  dutyCount: number;
}

interface RoomAssignment {
  id: number;
  roomNo: string;
  studentsCount: string;
  assignedFaculty: Faculty | null;
}

export default function DutyRoster() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [availableFaculty, setAvailableFaculty] = useState<Faculty[]>([]);
  const [isPrintMode, setIsPrintMode] = useState(false);
  
  // Default Rooms (Editable)
  const [assignments, setAssignments] = useState<RoomAssignment[]>([
    { id: 1, roomNo: "Room 101", studentsCount: "40", assignedFaculty: null },
    { id: 2, roomNo: "Room 102", studentsCount: "35", assignedFaculty: null },
    { id: 3, roomNo: "Hall 1", studentsCount: "80", assignedFaculty: null },
    { id: 4, roomNo: "Hall 2", studentsCount: "80", assignedFaculty: null },
  ]);

  useEffect(() => {
    // Refresh available list when date changes
    const filtered = getAvailableFaculty(selectedDate);
    setAvailableFaculty(filtered);
    // Optional: clear assignments on date change? 
    // setAssignments(prev => prev.map(a => ({ ...a, assignedFaculty: null })));
  }, [selectedDate]);

  const displayedFaculty = availableFaculty.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- Drag & Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, faculty: Faculty) => {
    e.dataTransfer.setData("facultyId", faculty.id);
  };

  const handleDrop = (e: React.DragEvent, assignmentId: number) => {
    e.preventDefault();
    const facultyId = e.dataTransfer.getData("facultyId");
    const faculty = availableFaculty.find(f => f.id === facultyId);
    
    if (faculty) {
      setAssignments(prev => prev.map(a => 
        a.id === assignmentId ? { ...a, assignedFaculty: faculty } : a
      ));
    }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  // --- Print View (The Output) ---
  if (isPrintMode) {
    return (
      <div className="min-h-screen bg-white text-black p-8 font-serif">
        {/* Print Controls (Hidden when printing) */}
        <div className="print:hidden mb-8 flex gap-4">
          <button onClick={() => setIsPrintMode(false)} className="flex items-center gap-2 text-blue-600 font-sans font-bold">
            <ArrowLeft size={16} /> Back to Editor
          </button>
          <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded font-sans font-bold hover:bg-blue-700">
            Click to Print / Save as PDF
          </button>
        </div>

        {/* The Actual Duty Chart Paper */}
        <div className="max-w-4xl mx-auto border border-black p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold uppercase underline">Victoria Institution (College)</h1>
            <h2 className="text-xl font-bold mt-2">Invigilation Duty Chart</h2>
            <p className="mt-2 text-lg"><strong>Date:</strong> {new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}</p>
          </div>

          <table className="w-full border-collapse border border-black mt-4 text-left">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black p-2 w-24">Room No.</th>
                <th className="border border-black p-2 w-24">Students</th>
                <th className="border border-black p-2">Name of Invigilator</th>
                <th className="border border-black p-2 w-32">Signature</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="h-16">
                  <td className="border border-black p-2 font-bold">{a.roomNo}</td>
                  <td className="border border-black p-2 text-center">{a.studentsCount}</td>
                  <td className="border border-black p-2 text-lg">
                    {a.assignedFaculty ? (
                      <>
                        <span className="font-bold">{a.assignedFaculty.name}</span>
                        <br />
                        <span className="text-xs italic">({a.assignedFaculty.department})</span>
                      </>
                    ) : (
                      <span className="text-gray-300 italic">-- Not Assigned --</span>
                    )}
                  </td>
                  <td className="border border-black p-2"></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-12 flex justify-between items-end">
             <div className="text-center">
                <div className="w-40 border-t border-black"></div>
                <p className="font-bold mt-1">Officer-in-Charge</p>
             </div>
             <div className="text-center">
                <div className="w-40 border-t border-black"></div>
                <p className="font-bold mt-1">Principal</p>
             </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Editor View (The Dashboard) ---
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-blue-900 tracking-tight">VIC Duty Roster Hub</h1>
          <p className="text-slate-500 font-medium">Victoria Institution (College)</p>
        </div>
        
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200">
          <Calendar className="text-blue-600 w-5 h-5" />
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="outline-none font-semibold text-slate-700 cursor-pointer bg-transparent"
          />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Roster Creator */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 min-h-[500px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                <ClipboardCheck className="text-emerald-600" /> Duty Allocation
              </h2>
              <button 
                onClick={() => setIsPrintMode(true)}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition shadow-sm hover:shadow-md"
              >
                <Printer size={16} /> Print Roster
              </button>
            </div>

            {/* Drop Zones (Rooms) */}
            <div className="grid gap-4">
              {assignments.map((assignment) => (
                <div 
                  key={assignment.id}
                  onDrop={(e) => handleDrop(e, assignment.id)}
                  onDragOver={handleDragOver}
                  className={`p-4 rounded-xl border-2 border-dashed transition-all group ${
                    assignment.assignedFaculty 
                      ? 'border-emerald-200 bg-emerald-50/50' 
                      : 'border-slate-200 bg-slate-50/50 hover:border-blue-300'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    {/* Editable Room Input */}
                    <div className="flex gap-2">
                      <input 
                        className="bg-transparent font-bold text-slate-600 uppercase tracking-wider text-xs border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none w-24"
                        value={assignment.roomNo}
                        onChange={(e) => setAssignments(prev => prev.map(a => a.id === assignment.id ? { ...a, roomNo: e.target.value } : a))}
                      />
                      <input 
                         className="bg-transparent text-slate-400 text-xs w-16 border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none"
                         value={assignment.studentsCount + " students"}
                         onChange={(e) => setAssignments(prev => prev.map(a => a.id === assignment.id ? { ...a, studentsCount: e.target.value.replace(/\D/g,'') } : a))}
                      />
                    </div>

                    {assignment.assignedFaculty && (
                       <button 
                         onClick={() => setAssignments(prev => prev.map(a => a.id === assignment.id ? { ...a, assignedFaculty: null } : a))}
                         className="text-slate-400 hover:text-red-500 transition"
                       >
                         <Trash2 size={14} />
                       </button>
                    )}
                  </div>
                  
                  {assignment.assignedFaculty ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shadow-sm">
                        {assignment.assignedFaculty.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{assignment.assignedFaculty.name}</p>
                        <p className="text-xs text-slate-500">{assignment.assignedFaculty.designation}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-10 flex items-center text-slate-400 text-sm italic">
                      Drag & Drop faculty here...
                    </div>
                  )}
                </div>
              ))}
              
              {/* Add Room Button */}
              <button 
                onClick={() => setAssignments(prev => [...prev, { id: Date.now(), roomNo: "New Room", studentsCount: "0", assignedFaculty: null }])}
                className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-medium hover:bg-slate-50 hover:border-blue-300 hover:text-blue-500 transition"
              >
                + Add Another Room
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Faculty Pool */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
          <div className="mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800">
              <Users className="text-blue-600" /> Available Pool
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search name or dept..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2">
            {displayedFaculty.map(f => (
              <div 
                key={f.id} 
                draggable
                onDragStart={(e) => handleDragStart(e, f)}
                className="group p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm group-hover:text-blue-700 transition">{f.name}</h4>
                    <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">{f.department}</p>
                  </div>
                  <div className="bg-slate-100 px-2 py-1 rounded text-[10px] font-bold text-slate-600">
                    {f.dutyCount} Duties
                  </div>
                </div>
              </div>
            ))}
            
            {displayedFaculty.length === 0 && (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-100">
                <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500 font-medium">No faculty available.</p>
                <p className="text-xs text-slate-400 mt-1">Check FID/Leave status.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}