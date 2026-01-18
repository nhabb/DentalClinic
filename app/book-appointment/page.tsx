"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  FaTooth,
  FaCalendarAlt,
  FaClock,
  FaUserMd,
  FaCheckCircle,
  FaArrowLeft,
  FaArrowRight,
  FaStethoscope,
  FaTeeth,
} from "react-icons/fa";

type ServiceType = "checkup" | "procedure" | null;

const timeSlots = [
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
  "4:00 PM",
  "4:30 PM",
];

const doctors = [
  { id: 1, name: "Dr. Sarah Haddad", specialty: "General Dentistry", available: true },
  { id: 2, name: "Dr. Michel Khoury", specialty: "Orthodontics", available: true },
  { id: 3, name: "Dr. Layla Nassar", specialty: "Cosmetic Dentistry", available: false },
];

const procedures = [
  { id: "cleaning", name: "Teeth Cleaning", duration: "30 min" },
  { id: "whitening", name: "Teeth Whitening", duration: "60 min" },
  { id: "filling", name: "Cavity Filling", duration: "45 min" },
  { id: "extraction", name: "Tooth Extraction", duration: "30 min" },
  { id: "rootcanal", name: "Root Canal", duration: "90 min" },
  { id: "crown", name: "Crown Fitting", duration: "60 min" },
];

export default function BookAppointment() {
  const [step, setStep] = useState(1);
  const [serviceType, setServiceType] = useState<ServiceType>(null);
  const [selectedProcedure, setSelectedProcedure] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<number | null>(null);

  const totalSteps = 4;

  const canProceed = () => {
    switch (step) {
      case 1:
        return serviceType !== null && (serviceType === "checkup" || selectedProcedure !== null);
      case 2:
        return selectedDate !== undefined;
      case 3:
        return selectedTime !== null;
      case 4:
        return selectedDoctor !== null;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < totalSteps && canProceed()) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const getSelectedDoctorInfo = () => doctors.find((d) => d.id === selectedDoctor);
  const getSelectedProcedureInfo = () => procedures.find((p) => p.id === selectedProcedure);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/patient-dashboard" className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
                <FaTooth className="text-white text-xl" />
              </div>
              <span className="text-xl font-bold text-gray-900">BrightSmile</span>
            </Link>
            <Link
              href="/patient-dashboard"
              className="text-gray-600 hover:text-dental-blue transition-colors flex items-center gap-2"
            >
              <FaArrowLeft className="text-sm" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page Title */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Book Your Appointment</h1>
          <p className="text-gray-600 text-lg">Schedule your visit in just a few simple steps</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-center">
            {[1, 2, 3, 4].map((s, i) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg transition-all duration-300 ${
                    step > s
                      ? "bg-green-500 text-white"
                      : step === s
                      ? "bg-dental-blue text-white shadow-lg shadow-dental-blue/30 scale-110"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {step > s ? <FaCheckCircle /> : s}
                </div>
                {i < 3 && (
                  <div
                    className={`w-16 sm:w-24 h-1 mx-2 rounded-full transition-all duration-300 ${
                      step > s ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-4">
            <div className="grid grid-cols-4 gap-4 sm:gap-16 text-center text-sm">
              <span className={step >= 1 ? "text-dental-blue font-medium" : "text-gray-400"}>
                Service
              </span>
              <span className={step >= 2 ? "text-dental-blue font-medium" : "text-gray-400"}>
                Date
              </span>
              <span className={step >= 3 ? "text-dental-blue font-medium" : "text-gray-400"}>
                Time
              </span>
              <span className={step >= 4 ? "text-dental-blue font-medium" : "text-gray-400"}>
                Doctor
              </span>
            </div>
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-10 mb-8">
          {/* Step 1: Service Type */}
          {step === 1 && (
            <div className="animate-fadeIn">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">What would you like to book?</h2>
              <p className="text-gray-600 mb-8">Choose between a routine checkup or a specific procedure</p>

              <div className="grid md:grid-cols-2 gap-6 mb-8">
                {/* Checkup Option */}
                <button
                  onClick={() => {
                    setServiceType("checkup");
                    setSelectedProcedure(null);
                  }}
                  className={`relative p-8 rounded-2xl border-2 transition-all duration-300 text-left group hover:shadow-lg ${
                    serviceType === "checkup"
                      ? "border-dental-blue bg-dental-blue/5 shadow-lg"
                      : "border-gray-200 hover:border-dental-blue/50"
                  }`}
                >
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all ${
                      serviceType === "checkup"
                        ? "bg-dental-blue text-white"
                        : "bg-gray-100 text-gray-500 group-hover:bg-dental-blue/10 group-hover:text-dental-blue"
                    }`}
                  >
                    <FaStethoscope className="text-3xl" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Regular Checkup</h3>
                  <p className="text-gray-600">
                    Routine dental examination to ensure your oral health is in great shape
                  </p>
                  <span className="inline-block mt-4 text-sm font-medium text-dental-blue">
                    Duration: 30 min
                  </span>
                  {serviceType === "checkup" && (
                    <div className="absolute top-4 right-4 w-8 h-8 bg-dental-blue rounded-full flex items-center justify-center">
                      <FaCheckCircle className="text-white" />
                    </div>
                  )}
                </button>

                {/* Procedure Option */}
                <button
                  onClick={() => setServiceType("procedure")}
                  className={`relative p-8 rounded-2xl border-2 transition-all duration-300 text-left group hover:shadow-lg ${
                    serviceType === "procedure"
                      ? "border-dental-blue bg-dental-blue/5 shadow-lg"
                      : "border-gray-200 hover:border-dental-blue/50"
                  }`}
                >
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all ${
                      serviceType === "procedure"
                        ? "bg-dental-blue text-white"
                        : "bg-gray-100 text-gray-500 group-hover:bg-dental-blue/10 group-hover:text-dental-blue"
                    }`}
                  >
                    <FaTeeth className="text-3xl" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Dental Procedure</h3>
                  <p className="text-gray-600">
                    Specific treatments like cleaning, whitening, fillings, and more
                  </p>
                  <span className="inline-block mt-4 text-sm font-medium text-dental-blue">
                    Various durations
                  </span>
                  {serviceType === "procedure" && (
                    <div className="absolute top-4 right-4 w-8 h-8 bg-dental-blue rounded-full flex items-center justify-center">
                      <FaCheckCircle className="text-white" />
                    </div>
                  )}
                </button>
              </div>

              {/* Procedure Selection */}
              {serviceType === "procedure" && (
                <div className="animate-fadeIn">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Select a procedure</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {procedures.map((proc) => (
                      <button
                        key={proc.id}
                        onClick={() => setSelectedProcedure(proc.id)}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          selectedProcedure === proc.id
                            ? "border-dental-blue bg-dental-blue/5"
                            : "border-gray-200 hover:border-dental-blue/50"
                        }`}
                      >
                        <p className="font-semibold text-gray-900">{proc.name}</p>
                        <p className="text-sm text-gray-500">{proc.duration}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Date Selection */}
          {step === 2 && (
            <div className="animate-fadeIn">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose a Date</h2>
              <p className="text-gray-600 mb-8">Select your preferred appointment date</p>

              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date() || date.getDay() === 0}
                  className="rounded-2xl border-2 border-gray-200 p-4"
                  classNames={{
                    months: "space-y-4",
                    month: "space-y-4",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-lg font-semibold",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-9 w-9 bg-transparent p-0 hover:bg-gray-100 rounded-lg",
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex",
                    head_cell: "text-gray-500 rounded-md w-12 font-medium text-sm",
                    row: "flex w-full mt-2",
                    cell: "text-center text-sm p-0 relative",
                    day: "h-12 w-12 p-0 font-normal rounded-xl hover:bg-dental-blue/10 transition-colors",
                    day_selected:
                      "bg-dental-blue text-white hover:bg-dental-blue hover:text-white focus:bg-dental-blue focus:text-white",
                    day_today: "bg-gray-100 text-gray-900 font-semibold",
                    day_outside: "text-gray-300",
                    day_disabled: "text-gray-300 hover:bg-transparent",
                  }}
                />
              </div>

              {selectedDate && (
                <div className="mt-6 text-center">
                  <p className="text-lg">
                    Selected:{" "}
                    <span className="font-semibold text-dental-blue">
                      {selectedDate.toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Time Selection */}
          {step === 3 && (
            <div className="animate-fadeIn">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Select a Time</h2>
              <p className="text-gray-600 mb-8">Choose an available time slot for your appointment</p>

              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                {timeSlots.map((time) => (
                  <button
                    key={time}
                    onClick={() => setSelectedTime(time)}
                    className={`p-4 rounded-xl border-2 font-medium transition-all ${
                      selectedTime === time
                        ? "border-dental-blue bg-dental-blue text-white shadow-lg shadow-dental-blue/30"
                        : "border-gray-200 hover:border-dental-blue/50 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <FaClock
                      className={`mx-auto mb-2 ${
                        selectedTime === time ? "text-white" : "text-dental-blue"
                      }`}
                    />
                    {time}
                  </button>
                ))}
              </div>

              {selectedTime && (
                <div className="mt-8 p-4 bg-dental-blue/5 rounded-xl text-center">
                  <p className="text-lg">
                    Your appointment:{" "}
                    <span className="font-semibold text-dental-blue">
                      {selectedDate?.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      at {selectedTime}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Doctor Selection */}
          {step === 4 && (
            <div className="animate-fadeIn">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Dentist</h2>
              <p className="text-gray-600 mb-8">Select a dentist for your appointment</p>

              <div className="grid md:grid-cols-3 gap-6">
                {doctors.map((doctor) => (
                  <button
                    key={doctor.id}
                    onClick={() => doctor.available && setSelectedDoctor(doctor.id)}
                    disabled={!doctor.available}
                    className={`relative p-6 rounded-2xl border-2 transition-all text-left ${
                      !doctor.available
                        ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                        : selectedDoctor === doctor.id
                        ? "border-dental-blue bg-dental-blue/5 shadow-lg"
                        : "border-gray-200 hover:border-dental-blue/50 hover:shadow-md"
                    }`}
                  >
                    <div className="w-16 h-16 bg-gradient-to-br from-dental-blue to-dental-teal rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4">
                      {doctor.name.split(" ")[1][0]}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{doctor.name}</h3>
                    <p className="text-gray-600 text-sm">{doctor.specialty}</p>
                    {!doctor.available && (
                      <span className="inline-block mt-3 text-xs font-medium text-red-500 bg-red-50 px-2 py-1 rounded-full">
                        Not Available
                      </span>
                    )}
                    {doctor.available && selectedDoctor === doctor.id && (
                      <div className="absolute top-4 right-4 w-8 h-8 bg-dental-blue rounded-full flex items-center justify-center">
                        <FaCheckCircle className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Appointment Summary */}
              {selectedDoctor && (
                <div className="mt-8 p-6 bg-gradient-to-r from-dental-blue/5 to-dental-teal/5 rounded-2xl">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Appointment Summary</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-dental-blue/10 rounded-lg flex items-center justify-center">
                        <FaStethoscope className="text-dental-blue" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Service</p>
                        <p className="font-semibold text-gray-900">
                          {serviceType === "checkup"
                            ? "Regular Checkup"
                            : getSelectedProcedureInfo()?.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-dental-blue/10 rounded-lg flex items-center justify-center">
                        <FaCalendarAlt className="text-dental-blue" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Date & Time</p>
                        <p className="font-semibold text-gray-900">
                          {selectedDate?.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          at {selectedTime}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-dental-blue/10 rounded-lg flex items-center justify-center">
                        <FaUserMd className="text-dental-blue" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Dentist</p>
                        <p className="font-semibold text-gray-900">
                          {getSelectedDoctorInfo()?.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-dental-blue/10 rounded-lg flex items-center justify-center">
                        <FaClock className="text-dental-blue" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Duration</p>
                        <p className="font-semibold text-gray-900">
                          {serviceType === "checkup"
                            ? "30 min"
                            : getSelectedProcedureInfo()?.duration}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1}
            className={`px-6 py-3 ${step === 1 ? "opacity-0 pointer-events-none" : ""}`}
          >
            <FaArrowLeft className="mr-2" />
            Back
          </Button>

          {step < totalSteps ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="px-8 py-3 bg-dental-blue hover:bg-dental-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
              <FaArrowRight className="ml-2" />
            </Button>
          ) : (
            <Button
              disabled={!canProceed()}
              className="px-8 py-3 bg-gradient-to-r from-dental-blue to-dental-teal hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm Appointment
              <FaCheckCircle className="ml-2" />
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
