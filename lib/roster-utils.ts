import facultyData from './faculty-data.json';

export const getAvailableFaculty = (selectedDate: string) => {
  const date = new Date(selectedDate);
  // Get the full day name (e.g., "Monday")
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  
  return facultyData.filter(f => {
    // Check if the current day is mentioned in their FID field
    // Support both single days and comma-separated days (e.g., "Tuesday, Saturday")
    const fidDays = f.fid.toLowerCase().split(',').map(d => d.trim());
    const isFID = fidDays.some(day => dayName.toLowerCase().includes(day) || day.includes(dayName.toLowerCase()));
    return !isFID; // Return faculty who DON'T have FID on this day
  });
};
