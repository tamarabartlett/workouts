import { HttpInterceptorFn } from '@angular/common/http';

/** Send session cookies to same-origin `/api` routes (and the dev proxy). */
export const credentialsInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ withCredentials: true }));
