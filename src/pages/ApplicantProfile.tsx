import { Navigate } from 'react-router';

export default function ApplicantProfile() {
  return <Navigate to="/applicant?tab=profile" replace />;
}
