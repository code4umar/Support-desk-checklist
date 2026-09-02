import { User } from '../../users/user.entity';

// Belt-and-suspenders: password_hash already has select:false on the
// entity, but if a caller ever does .addSelect('user.password_hash')
// (as login must, to compare it), this guarantees it never leaks into
// a response body — including nested inside a ticket's requester/assignee.
export function sanitizeUser(user: User) {
  const { password_hash, ...safe } = user;
  return safe;
}
