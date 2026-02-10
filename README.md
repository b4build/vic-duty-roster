# VIC Duty Roster Hub

Victoria Institution (College) Duty Management System

## Setup Instructions for Windows 10

### Prerequisites

1. **Install Node.js**
   - Visit https://nodejs.org/
   - Download the LTS (Long Term Support) version
   - Run the installer and follow the prompts
   - Verify installation by opening Command Prompt and running: `node --version`

2. **Install VS Code** (Recommended)
   - Download from https://code.visualstudio.com/
   - Install with default settings

### Installation Steps

1. **Extract the project folder** to your computer (e.g., Downloads or Desktop)

2. **Open Command Prompt**
   - Press `Win + R`
   - Type `cmd` and press Enter

3. **Navigate to the project folder**
   ```
   cd C:\Users\mhbook\Downloads\vic-duty-roster-app
   ```
   *(Adjust the path based on where you extracted it)*

4. **Install dependencies**
   ```
   npm install
   ```
   This will take 2-3 minutes to download all required packages.
   
   **Note:** You may see some warnings about deprecated packages - this is normal and safe to ignore.

5. **Start the development server**
   ```
   npm run dev
   ```

6. **Open your browser**
   - Go to http://localhost:3000
   - You should see the VIC Duty Roster Hub!

### Features

✅ **Day-wise Faculty Filtering**: Automatically hides faculty on their FID day  
✅ **Drag & Drop Assignment**: Drag faculty names to rooms to assign duties  
✅ **Print-Ready Output**: Click "Print Roster" to generate a professional duty chart  
✅ **Editable Rooms**: Click on room numbers and student counts to edit them  
✅ **Search Functionality**: Search faculty by name or department  
✅ **Duty Counter**: Tracks how many duties each faculty member has been assigned  

### Using the Application

1. **Select a Date**: Use the calendar picker at the top right
2. **Check Available Faculty**: The right sidebar shows who's available (excluding FID)
3. **Assign Duties**: Drag a faculty member's name to a room slot on the left
4. **Add/Remove Rooms**: Use the "+ Add Another Room" button or trash icons
5. **Print**: Click "Print Roster" to generate the official duty chart
6. **Save as PDF**: From the print preview, select "Save as PDF" in the print dialog

### Customizing Faculty Data

Edit the file `lib/faculty-data.json` to add/update faculty members:

```json
{
  "id": "DEPT-01",
  "name": "Dr. Faculty Name",
  "designation": "Associate Professor",
  "department": "Department Name",
  "fid": "Monday",
  "dutyCount": 0,
  "shortName": "Dr. F. Name"
}
```

**FID Field Examples:**
- Single day: `"Monday"`
- Multiple days: `"Tuesday, Saturday"`
- No FID: `""`

### Troubleshooting

**Problem**: "npm is not recognized"
- **Solution**: Restart Command Prompt after installing Node.js, or restart your computer

**Problem**: Error about next.config.ts
- **Solution**: The project now uses next.config.mjs (already fixed in this version)

**Problem**: No styling (plain white page)
- **Solution**: 
  1. Stop the server (press Ctrl+C in Command Prompt)
  2. Run: `npm install`
  3. Run: `npm run dev`
  4. Refresh browser

**Problem**: Changes not showing
- **Solution**: Save your files (Ctrl+S in VS Code) and refresh the browser (Ctrl+R or F5)

**Problem**: Port already in use
- **Solution**: Close any other instances of the app, or the server will automatically use port 3001

### Deploying to Vercel (Optional - Make it Live Online)

When ready to make the site accessible from anywhere:

1. **Create a GitHub account** at https://github.com (if you don't have one)

2. **Install Git** for Windows from https://git-scm.com/download/win

3. **Create a new repository** on GitHub named "vic-duty-roster"

4. **Push your code** (in Command Prompt, inside your project folder):
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/vic-duty-roster.git
   git push -u origin main
   ```
   *(Replace YOUR_USERNAME with your GitHub username)*

5. **Deploy on Vercel**:
   - Go to https://vercel.com
   - Sign in with GitHub
   - Click "New Project"
   - Select your "vic-duty-roster" repository
   - Click "Deploy"

Your site will be live at `https://vic-duty-roster.vercel.app`!

## Technical Details

### Built With
- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Lucide React** - Icons

### File Structure
```
vic-duty-roster-app/
├── app/
│   ├── page.tsx          # Main dashboard component
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── lib/
│   ├── faculty-data.json # Faculty database
│   └── roster-utils.ts   # FID logic & utilities
├── package.json          # Dependencies
└── README.md            # This file
```

### Adding More Features

Want to add database persistence, email notifications, or multi-shift support? The codebase is ready to expand. Contact the developer or modify `app/page.tsx` and `lib/roster-utils.ts`.

## Support

For issues or questions:
1. Check that Node.js is properly installed (`node --version`)
2. Ensure all files are in the correct locations
3. Verify dependencies are installed (`npm install`)
4. Make sure the dev server is running (`npm run dev`)
5. Check the browser console (F12) for errors

---

**Created for Victoria Institution (College)**  
Version 1.0 - February 2026
