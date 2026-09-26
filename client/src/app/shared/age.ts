// Keep age derived from DOB: storing an age would become wrong next birthday.
// An optional date makes birthday boundary cases easy to demonstrate and test.
export function calculateAge(dob: string | null | undefined, today = new Date()): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [year, month, day] = dob.split('-').map(Number);
  // Use local calendar parts, not UTC parsing, which can shift a DOB by a day.
  const birthday = new Date(0);
  birthday.setFullYear(year, month - 1, day);
  birthday.setHours(0, 0, 0, 0);
  if (year < 1 || birthday.getFullYear() !== year || birthday.getMonth() !== month - 1
      || birthday.getDate() !== day || birthday > today) return null;

  let age = today.getFullYear() - year;
  const birthdayStillAhead = today.getMonth() < month - 1
    || (today.getMonth() === month - 1 && today.getDate() < day);
  if (birthdayStillAhead) age--;
  // For February 29 births, the birthday is reached on March 1 in non-leap years.
  return age;
}
