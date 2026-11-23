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
  projectId: string
  projectTitle: string
  studentName: string
  scheduling?: BookingFeedback & { canApprove: boolean }
}

export interface BookingSlot {
  startsAt: string
  endsAt: string
}

export interface BookingFeedback {
  reason: string
  alternatives: BookingSlot[]
}

export interface BookingResult extends BookingFeedback {
  id: string
  status: 'approved' | 'pending'
}

export interface Project {
  id: string
  title: string
  description: string
  deadlineAt: string | null
}

export interface AssistantStatus {
  mode: 'available' | 'unavailable'
  message: string
}

export interface EquipmentRecommendation {
  resourceId: string
  name: string
  department: Department
  lab: string
  status: ResourceStatus
  requiresApproval: boolean
  projectEvidence: string
  capability: string
  usage: string
  slots: BookingSlot[]
}

export interface AssistantResult {
  mode: 'gemini' | 'fallback'
  message: string | null
  projectId: string | null
  durationMinutes: number
  questions: string[]
  recommendations: EquipmentRecommendation[]
}
