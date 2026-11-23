export const demoAccountIds = ['demo-student', 'demo-faculty', 'faculty-mech', 'faculty-cse']

const resources = [
  ['esp32-devkit', 'ESP32 Development Kit', 'ECE', 'Embedded Systems Lab', 'Microcontrollers',
    'Wi-Fi and Bluetooth enabled board for IoT prototyping and embedded applications.',
    'A bench kit for building connected prototypes and testing sensor interfaces. Includes a USB cable, breadboard, jumper leads and a basic sensor assortment.',
    ['Dual-core ESP32', 'Wi-Fi and Bluetooth LE', '3.3 V GPIO'], 'Engineering Block A · Room 204', 'available', 0, '/images/esp32.webp'],
  ['digital-oscilloscope', 'Digital Oscilloscope', 'ECE', 'Electronics Lab', 'Test & Measurement',
    '4-channel oscilloscope for signal analysis, circuit debugging, and waveform capture.',
    'A shared bench instrument for checking analogue and digital signals. Use it with the included passive probes and record captures to USB.',
    ['4 analogue channels', '100 MHz bandwidth', '1 GSa/s sampling'], 'Engineering Block A · Room 210', 'available', 0, '/images/oscilloscope.webp'],
  ['fdm-3d-printer', 'FDM 3D Printer', 'Mechanical', 'Fabrication Lab', 'Digital Fabrication',
    'Build precise physical prototypes with a supervised, filament-based 3D printer.',
    'A supervised FDM station for small functional prototypes, enclosures and fixtures. Bring a sliced print file and consult the lab supervisor about material settings.',
    ['220 × 220 × 250 mm build area', 'PLA and PETG', '0.4 mm nozzle'], 'Design Workshop · Room M12', 'available', 1, '/images/printer.webp'],
  ['fpga-board', 'FPGA Development Board', 'ECE', 'Embedded Systems Lab', 'Programmable Logic',
    'Prototype digital logic and validate HDL designs on an Artix-7 development board.',
    'Use the included switches, LEDs and PMOD headers to demonstrate synchronous logic and soft-core processor designs.',
    ['Artix-7 FPGA', 'Onboard USB-JTAG', 'Four PMOD headers'], 'Engineering Block A · Room 204', 'available', 1, null],
  ['gpu-workstation', 'GPU Workstation', 'CSE', 'High Performance Computing Lab', 'High Performance Computing',
    'A dedicated workstation for model training, simulation, and GPU-accelerated coursework.',
    'A shared Linux workstation with GPU-accelerated compute. Bring reproducible environments and store project artifacts in your own workspace.',
    ['24 GB GPU memory', '64 GB system memory', 'Ubuntu Linux'], 'Computing Centre · Room C31', 'available', 1, null],
  ['laser-cutter', 'CO₂ Laser Cutter', 'Mechanical', 'Fabrication Lab', 'Digital Fabrication',
    'Supervised cutting and engraving for approved sheet materials.',
    'A workshop laser cutter for flat parts and enclosure panels. A lab supervisor checks all materials before use.',
    ['60 W CO₂ laser', '600 × 400 mm work area', 'Ventilated enclosure'], 'Design Workshop · Room M14', 'maintenance', 1, null],
]

export function seedDemo(db, now = new Date()) {
  // Fixture timestamps are relative to initialization so a fresh demo has upcoming activity.
  const campusOffsetMinutes = 330
  const campusDate = new Date(now.getTime() + campusOffsetMinutes * 60_000)
  const at = (days, hour) => {
    const dayStartUtc = Date.UTC(campusDate.getUTCFullYear(), campusDate.getUTCMonth(), campusDate.getUTCDate() + days)
    return new Date(dayStartUtc + (hour * 60 - campusOffsetMinutes) * 60_000).toISOString()
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    if (db.prepare('SELECT 1 FROM users WHERE id = ?').get(demoAccountIds[0])) {
      db.exec('COMMIT')
      return
    }
    const user = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)')
    user.run('demo-student', 'Ananya Rao', 'student', 'ECE')
    user.run('demo-faculty', 'Dr. Meera Iyer', 'faculty', 'ECE')
    user.run('student-aarav', 'Aarav Shah', 'student', 'ECE')
    user.run('faculty-mech', 'Prof. Kavya Sen', 'faculty', 'Mechanical')
    user.run('faculty-cse', 'Dr. Nikhil Menon', 'faculty', 'CSE')

    const project = db.prepare('INSERT INTO projects (id, owner_id, title, description, deadline_at) VALUES (?, ?, ?, ?, ?)')
    project.run('campus-air', 'demo-student', 'Campus Air Monitor', 'Prototype a connected air-quality sensor for shared study spaces.', at(8, 13))
    project.run('signal-filter', 'student-aarav', 'Adaptive Signal Filter', 'Validate a digital filter for a classroom demonstration.', at(6, 12))

    const resource = db.prepare('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const availability = db.prepare('INSERT INTO availability (resource_id, starts_at, ends_at, kind) VALUES (?, ?, ?, ?)')
    resources.forEach(([id, name, department, lab, category, summary, description, specifications, location, status, approval, image], order) => {
      resource.run(id, name, department, lab, category, summary, description, JSON.stringify(specifications), location, status, approval, image, order)
      for (const days of [2, 4, 7]) {
        availability.run(id, at(days, 9), at(days, 17), status === 'maintenance' ? 'maintenance' : 'open')
      }
    })

    const requirement = db.prepare('INSERT INTO project_equipment_requirements VALUES (?, ?)')
    for (const id of ['esp32-devkit', 'digital-oscilloscope', 'fdm-3d-printer']) requirement.run('campus-air', id)
    requirement.run('signal-filter', 'fpga-board')

    const booking = db.prepare('INSERT INTO bookings (id, user_id, project_id, resource_id, starts_at, ends_at, status, purpose) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    booking.run('bk-101', 'demo-student', 'campus-air', 'digital-oscilloscope', at(2, 10), at(2, 11), 'approved', 'Verify sensor signal stability.')
    booking.run('bk-102', 'demo-student', 'campus-air', 'esp32-devkit', at(2, 14), at(2, 16), 'approved', 'Test Wi-Fi telemetry on the prototype.')
    booking.run('bk-103', 'demo-student', 'campus-air', 'fdm-3d-printer', at(4, 11), at(4, 13), 'pending', 'Print a ventilated sensor enclosure.')
    booking.run('bk-104', 'demo-student', 'campus-air', 'fpga-board', at(7, 11), at(7, 13), 'pending', 'Compare a hardware filter with our microcontroller implementation.')
    booking.run('bk-105', 'student-aarav', 'signal-filter', 'fpga-board', at(4, 10), at(4, 12), 'pending', 'Check the filter on a programmable logic board.')

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
