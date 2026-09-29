import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { GroupApi } from '../shared/group-api';

// Verify the current session with an existing Super Admin-only endpoint.
// A forged browser role cannot authorize navigation.
export const superAdminGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(GroupApi).creationRequests(true).pipe(
    map(() => true),
    catchError(error => of(router.createUrlTree([error.status === 403 ? '/home' : '/login'])))
  );
};
