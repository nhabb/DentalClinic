"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FaTooth } from "react-icons/fa";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDownIcon } from "lucide-react";

export default function Form() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 sm:px-6 lg:px-8 gradient-auth-bg py-12">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="w-12 h-12 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center shadow-lg">
              <FaTooth className="text-white text-2xl" />
            </div>
            <span className="text-2xl font-bold text-white">BrightSmile</span>
          </Link>
          <h2 className="mt-4 text-3xl font-extrabold text-white tracking-tight">
            Complete Your Profile
          </h2>
          <p className="mt-2 text-base text-white/90 font-light">
            Help us serve you better by providing your information
          </p>
        </div>

        <form className="space-y-6">
          {/* Personal Information */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              Personal Information
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              Please provide your basic information
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="firstName"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    First Name
                  </FieldLabel>
                  <Input
                    id="firstName"
                    name="firstName"
                    type="text"
                    placeholder="Ahmad"
                    required
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="lastName"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    Last Name
                  </FieldLabel>
                  <Input
                    id="lastName"
                    name="lastName"
                    type="text"
                    placeholder="Khoury"
                    required
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
              </div>
              {/* <Field>
                <FieldLabel
                  htmlFor="email"
                  className="text-gray-900 font-semibold text-sm tracking-wide"
                >
                  Email Address
                </FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="john.doe@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                />
              </Field> */}
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="phone"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    Phone Number
                  </FieldLabel>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="+961 3 123 456"
                    required
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="dateOfBirth"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    Date of Birth
                  </FieldLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        id="dateOfBirth"
                        className="w-full justify-between font-normal"
                      >
                        Select date
                        <ChevronDownIcon />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-4 max-h-[600px] overflow-auto"
                      align="center"
                      side="bottom"
                      sideOffset={10}
                      avoidCollisions={false}
                      alignOffset={0}
                    >
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        fromYear={1920}
                        toYear={new Date().getFullYear()}
                        className="rounded-md border text-base"
                        classNames={{
                          months: "space-y-4",
                          month: "space-y-4",
                          caption:
                            "flex justify-center pt-1 relative items-center",
                          caption_label: "text-base font-medium",
                          nav: "hidden",
                          dropdown_month: "text-base px-3 py-2 min-w-[120px]",
                          dropdown_year: "text-base px-3 py-2 min-w-[100px]",
                          dropdowns: "flex gap-2",
                          head_row: "flex mt-2",
                          head_cell:
                            "text-gray-500 rounded-md w-10 font-normal text-base",
                          row: "flex w-full mt-2",
                          cell: "text-center text-base p-0 relative",
                          day: "h-10 w-10 p-0 font-normal text-base",
                          day_selected:
                            "bg-dental-blue text-white hover:bg-dental-blue hover:text-white focus:bg-dental-blue focus:text-white",
                          day_today: "bg-gray-100 text-gray-900",
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {/* Address Information */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              Address Information
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              Where can we reach you?
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <Field>
                <FieldLabel
                  htmlFor="address"
                  className="text-gray-900 font-semibold text-sm tracking-wide"
                >
                  Street Address
                </FieldLabel>
                <Input
                  id="address"
                  name="address"
                  type="text"
                  placeholder="Hamra Street, Building 123"
                  required
                  className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="city"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    City
                  </FieldLabel>
                  <Input
                    id="city"
                    name="city"
                    type="text"
                    placeholder="Beirut"
                    required
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="state"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    Governorate
                  </FieldLabel>
                  <Input
                    id="state"
                    name="state"
                    type="text"
                    placeholder="Beirut"
                    required
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {/* Emergency Contact */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              Emergency Contact
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              Who should we contact in case of emergency?
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="emergencyContact"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    Contact Name
                  </FieldLabel>
                  <Input
                    id="emergencyContact"
                    name="emergencyContact"
                    type="text"
                    placeholder="Layla Khoury"
                    required
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="emergencyPhone"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    Contact Phone
                  </FieldLabel>
                  <Input
                    id="emergencyPhone"
                    name="emergencyPhone"
                    type="tel"
                    placeholder="+961 3 987 654"
                    required
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {/* Insurance Information */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              Insurance Information
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              Please provide your insurance details
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="insuranceProvider"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    Insurance Provider
                  </FieldLabel>
                  <Input
                    id="insuranceProvider"
                    name="insuranceProvider"
                    type="text"
                    placeholder="Globemed"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor="insurancePolicy"
                    className="text-gray-900 font-semibold text-sm tracking-wide"
                  >
                    Policy Number
                  </FieldLabel>
                  <Input
                    id="insurancePolicy"
                    name="insurancePolicy"
                    type="text"
                    placeholder="ABC123456789"
                    className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                  />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {/* Medical History */}
          <FieldSet className="border-2 border-dental-blue/20 rounded-xl p-6 bg-white shadow-xl">
            <FieldLegend className="text-2xl font-bold text-dental-blue px-3 bg-white tracking-tight">
              Medical History
            </FieldLegend>
            <FieldDescription className="text-gray-600 mb-6 font-light text-base">
              Help us provide better care by sharing your medical history
            </FieldDescription>
            <FieldGroup className="space-y-4">
              <Field>
                <FieldLabel
                  htmlFor="medicalConditions"
                  className="text-gray-900 font-semibold text-sm tracking-wide"
                >
                  Medical Conditions
                </FieldLabel>
                <Input
                  id="medicalConditions"
                  name="medicalConditions"
                  type="text"
                  placeholder="e.g., Diabetes, Hypertension"
                  className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                />
              </Field>
              <Field>
                <FieldLabel
                  htmlFor="allergies"
                  className="text-gray-900 font-semibold text-sm tracking-wide"
                >
                  Allergies
                </FieldLabel>
                <Input
                  id="allergies"
                  name="allergies"
                  type="text"
                  placeholder="e.g., Penicillin, Latex"
                  className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                />
              </Field>
              <Field>
                <FieldLabel
                  htmlFor="currentMedications"
                  className="text-gray-900 font-semibold text-sm tracking-wide"
                >
                  Current Medications
                </FieldLabel>
                <Input
                  id="currentMedications"
                  name="currentMedications"
                  type="text"
                  placeholder="e.g., Aspirin, Lisinopril"
                  className="focus:ring-2 focus:ring-dental-blue focus:border-dental-blue text-base font-normal"
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          {/* Submit Button */}
          <Link href="/patient-dashboard">
            <Button
              type="submit"
              className="w-full py-6 gradient-auth-card hover:shadow-xl transition-all transform hover:scale-[1.01]"
              size="lg"
            >
              Submit Patient Information
            </Button>
          </Link>
        </form>
      </div>
    </div>
  );
}
