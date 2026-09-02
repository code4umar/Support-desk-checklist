export enum UserRole {
  CUSTOMER = 'customer',
  AGENT = 'agent',
  ADMIN = 'admin',
}

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum TicketPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

// Priority -> hours until due, per rule 8 of the spec.
export const PRIORITY_DUE_HOURS: Record<TicketPriority, number> = {
  [TicketPriority.URGENT]: 4,
  [TicketPriority.HIGH]: 24,
  [TicketPriority.NORMAL]: 72,
  [TicketPriority.LOW]: 168,
};

// The only legal status transitions (rule 4). Anything not listed here -> 409.
export const LEGAL_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.RESOLVED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  [TicketStatus.CLOSED]: [TicketStatus.IN_PROGRESS],
};
