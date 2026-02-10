import facultyData from './faculty-data.json';

export const getAvailableFaculty = (selectedDate: string) => {
  const date = new Date(selectedDate);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  
  return facultyData.filter(f => {
    // Check if the current day is in the teacher's FID list
    const isFID = f.fid.toLowerCase().includes(dayName.toLowerCase());
    return !isFID;
  });
};