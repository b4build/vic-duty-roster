"use client";
import React, { useState } from 'react';
import { ArrowLeft, Plus, Edit, Trash2, Search } from 'lucide-react';
import facultyData from '@/lib/faculty-data.json';

export default function FacultyDirectory() {
  const [faculty, setFaculty] = useState(facultyData);
  const [searchTerm, setSearchTerm] = useState('');
  
  const filtered = faculty.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.department.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const departments = [...new Set(faculty.map(f => f.department))].sort();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-blue-600 hover:text-blue-700">
              <ArrowLeft size={24} />
            </Link>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-900 to-blue-700">
              Faculty Directory
            </h1>
          </div>
          <button className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg">
            <Plus size={20} /> Add Faculty
          </button>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border-2 border-blue-100 p-6 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-4 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by name or department..."
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((f) => (
            <div key={f.id} className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 p-6 hover:shadow-xl transition transform hover:-translate-y-1">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-black text-lg shadow-lg">
                  {f.name.charAt(0)}
                </div>
                <div className="flex gap-2">
                  <button className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition">
                    <Edit size={16} />
                  </button>
                  <button className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <h3 className="font-black text-slate-900 text-lg mb-1">{f.name}</h3>
              <p className="text-sm text-slate-600 font-semibold mb-1">{f.designation}</p>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-3">{f.department}</p>
              
              {f.fid && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                  <p className="text-xs text-amber-700 font-bold">FID: {f.fid}</p>
                </div>
              )}
              
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-200">
                <span className="text-xs text-slate-500 font-semibold">ID: {f.id}</span>
                <span className="bg-blue-100 px-3 py-1 rounded-lg text-xs font-black text-blue-700">
                  {f.dutyCount} Duties
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}