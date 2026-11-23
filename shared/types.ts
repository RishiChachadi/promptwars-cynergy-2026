export type Department = 'ECE' | 'CSE' | 'Mechanical'
export type ResourceStatus = 'available' | 'maintenance'
export type BookingStatus = 'pending' | 'approved' | 'declined' | 'cancelled'

export interface DemoAccount {
  id: string
  name: string
  role: 'student' | 'faculty'
  department: Department
}

export interface AvailabilityWindow {
  startsAt: string
  endsAt: string
  kind: 'open' | 'maintenance'
}

export interface Resource {
  id: string
  name: string
  department: Department
  lab: string
  category: string
  summary: string
  description: string
  specifications: string[]
  location: string
  status: ResourceStatus
  requiresApproval: boolean
  image: string | null
}

export interface ResourceDetail extends Resource {
  availability: AvailabilityWindow[]
}

export interface Booking {
  id: string
  status: BookingStatus
  startsAt: string
  endsAt: string
  purpose: string
  resourceId: string
  resourceName: string
  department: Department
  lab: string
  projectTitle: string
  studentName: string
}

export interface Project {
  id: string
  title: string
  description: string
}

export interface AssistantStatus {
  mode: 'unavailable'
  message: string
}
