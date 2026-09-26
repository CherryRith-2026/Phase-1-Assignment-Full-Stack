// Only these fields belong to profile editing. Never copy the whole request
// into MongoDB: it could include a role, password, age, or database operators.
export function profileChanges(body, today = new Date()) {
  const changes = {};
  for (const field of ['username', 'email', 'firstName', 'lastName', 'dob']) {
    if (!Object.hasOwn(body ?? {}, field)) continue;
    if (typeof body[field] !== 'string') {
      throw Object.assign(new Error(`${field} must be text.`), { status: 400 });
    }
    changes[field] = body[field].trim();
  }
  if (changes.username === '') {
    throw Object.assign(new Error('Username is required.'), { status: 400 });
  }
  if (changes.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.email)) {
    throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  }
  // Empty DOB means "not provided". A supplied date must be a real calendar day.
  if (changes.dob) {
    const [year, month, day] = changes.dob.split('-').map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(changes.dob) || year < 1
        || date.getFullYear() !== year || date.getMonth() !== month - 1
        || date.getDate() !== day || date > today) {
      throw Object.assign(new Error('Enter a valid date of birth that is not in the future.'), { status: 400 });
    }
  }
  return changes;
}
