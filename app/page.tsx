"use client";
import React, { useState, useEffect } from 'react';
import { Calendar, Users, Printer, Trash2, Plus, ArrowRight, ArrowLeft, X } from 'lucide-react';
import { getAvailableFaculty } from '@/lib/roster-utils';

interface Faculty {
  id: string;
  name: string;
  department: string;
  designation: string;
  fid: string;
  dutyCount: number;
  shortName?: string;
}

interface Room {
  id: number;
  roomNo: string;
  students: string;
  invigilators: string;
}

export default function DutyRoster() {
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
    // Allocate invigilators to rooms
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

  if (isPrintMode) {
    const allocation1 = allocateInvigilators(rooms1, selected1);
    const allocation2 = allocateInvigilators(rooms2, selected2);
    
    return (
      <div className="min-h-screen bg-white p-8">
        <div className="print:hidden mb-8 flex gap-4">
          <button onClick={() => setIsPrintMode(false)} className="flex items-center gap-2 text-blue-600 font-bold hover:underline">
            <ArrowLeft size={16} /> Back to Editor
          </button>
          <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700">
            Print / Save as PDF
          </button>
        </div>

        <div className="max-w-4xl mx-auto border-2 border-black p-8 font-serif">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold uppercase">Victoria Institution (College)</h1>
            <h2 className="text-xl font-bold mt-2">Invigilation Duty Chart</h2>
            <p className="mt-2 text-lg">
              <strong>{course} {semester} {year}</strong> ({curriculum})
            </p>
            <p className="mt-1"><strong>Date:</strong> {new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}</p>
          </div>

          {shiftMode !== 'afternoon' && (
            <div className="mb-8">
              <h3 className="text-lg font-bold text-center mb-2">Shift 1 (Forenoon)</h3>
              <p className="text-center mb-1">Time: {time1}</p>
              <p className="text-center mb-4">Supervisor: {super1 || '—'}</p>
              
              <table className="w-full border-collapse border-2 border-black">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border-2 border-black p-2 font-bold">Room No.</th>
                    <th className="border-2 border-black p-2 font-bold">Students</th>
                    <th className="border-2 border-black p-2 font-bold">Invigilators</th>
                    <th className="border-2 border-black p-2 font-bold w-32">Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation1.map((room: any) => (
                    <tr key={room.id}>
                      <td className="border-2 border-black p-2 text-center font-bold">{room.roomNo} ({room.students})</td>
                      <td className="border-2 border-black p-2 text-center">{room.students}</td>
                      <td className="border-2 border-black p-2">{room.assignedInvigilators.join(', ') || '—'}</td>
                      <td className="border-2 border-black p-2"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {shiftMode !== 'forenoon' && (
            <div className="mb-8">
              <h3 className="text-lg font-bold text-center mb-2">Shift 2 (Afternoon)</h3>
              <p className="text-center mb-1">Time: {time2}</p>
              <p className="text-center mb-4">Supervisor: {super2 || '—'}</p>
              
              <table className="w-full border-collapse border-2 border-black">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border-2 border-black p-2 font-bold">Room No.</th>
                    <th className="border-2 border-black p-2 font-bold">Students</th>
                    <th className="border-2 border-black p-2 font-bold">Invigilators</th>
                    <th className="border-2 border-black p-2 font-bold w-32">Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation2.map((room: any) => (
                    <tr key={room.id}>
                      <td className="border-2 border-black p-2 text-center font-bold">{room.roomNo} ({room.students})</td>
                      <td className="border-2 border-black p-2 text-center">{room.students}</td>
                      <td className="border-2 border-black p-2">{room.assignedInvigilators.join(', ') || '—'}</td>
                      <td className="border-2 border-black p-2"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-16 flex justify-between px-8">
            <div className="text-center">
              <div className="w-48 border-t-2 border-black pt-1"></div>
              <p className="font-bold mt-2">Officer-in-Charge</p>
            </div>
            <div className="text-center">
              <div className="w-48 border-t-2 border-black pt-1"></div>
              <p className="font-bold mt-2">Principal</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-blue-900">📘 Exam Duty Roster</h1>
            <p className="text-slate-600 font-semibold mt-1">Created by Mainul Hossain</p>
            <a href="/faculty" className="text-blue-600 hover:underline font-bold mt-2 inline-block">
              Faculty Directory →
            </a>
          </div>
        </header>

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
