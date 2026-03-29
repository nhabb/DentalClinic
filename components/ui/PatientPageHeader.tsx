import Link from "next/link";
import { FaTooth, FaArrowLeft } from "react-icons/fa";

interface PatientPageHeaderProps {
  backHref?: string;
  backLabel?: string;
}

export function PatientPageHeader({
  backHref = "/patient-dashboard",
  backLabel = "Back to Dashboard",
}: PatientPageHeaderProps) {
  return (
    <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <Link
            href="/patient-dashboard"
            className="flex items-center space-x-2"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
              <FaTooth className="text-white text-xl" />
            </div>
            <span className="text-xl font-bold text-gray-900">BrightSmile</span>
          </Link>
          <Link
            href={backHref}
            className="text-gray-600 hover:text-dental-blue transition-colors flex items-center gap-2"
          >
            <FaArrowLeft className="text-sm" />
            {backLabel}
          </Link>
        </div>
      </div>
    </header>
  );
}
