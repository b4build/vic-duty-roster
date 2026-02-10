import facultyData from './faculty-data.json';

export const getAvailableFaculty = (selectedDate: string) => {
  const date = new Date(selectedDate);
  // Get the full day name (e.g., "Monday")
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  
  return facultyData.filter(f => {
    // Check if the current day is mentioned in their FID field
    const isFID = f.fid.toLowerCase().includes(dayName.toLowerCase());
    return !isFID;
  });
};