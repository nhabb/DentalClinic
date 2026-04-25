'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function PatientInfoPage() {
  const [formData, setFormData] = useState({
    dateOfBirth: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    emergencyContact: '',
    emergencyPhone: '',
    insuranceProvider: '',
    insuranceId: '',
    medicalHistory: '',
    allergies: '',
    currentMedications: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Handle form submission (send to API)
    alert('Patient information saved successfully!')
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  return (
    <div className="min-h-screen gradient-soft py-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg
      :px-8">
        {/* Header */}
        <FormHeader />

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 space-y-8">
          {/* Personal Information Section */}
          <FormSection title="Personal Information">
            <InputField
              label="Date of Birth"
              name="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={handleChange}
              required
            />
            <InputField
              label="Phone Number"
              name="phone"
              type="tel"
              placeholder="(555) 123-4567"
              value={formData.phone}
              onChange={handleChange}
              required
            />
            <InputField
              label="Street Address"
              name="address"
              type="text"
              placeholder="123 Main Street"
              value={formData.address}
              onChange={handleChange}
              required
            />
            <div className="grid grid-cols-3 gap-4">
              <InputField
                label="City"
                name="city"
                type="text"
                value={formData.city}
                onChange={handleChange}
                required
              />
              <InputField
                label="State"
                name="state"
                type="text"
                placeholder="CA"
                value={formData.state}
                onChange={handleChange}
                required
              />
              <InputField
                label="ZIP Code"
                name="zipCode"
                type="text"
                placeholder="12345"
                value={formData.zipCode}
                onChange={handleChange}
                required
              />
            </div>
          </FormSection>

          {/* Emergency Contact Section */}
          <FormSection title="Emergency Contact">
            <InputField
              label="Contact Name"
              name="emergencyContact"
              type="text"
              placeholder="John Doe"
              value={formData.emergencyContact}
              onChange={handleChange}
              required
            />
            <InputField
              label="Contact Phone"
              name="emergencyPhone"
              type="tel"
              placeholder="(555) 123-4567"
              value={formData.emergencyPhone}
              onChange={handleChange}
              required
            />
          </FormSection>

          {/* Insurance Information Section */}
          <FormSection title="Insurance Information">
            <InputField
              label="Insurance Provider"
              name="insuranceProvider"
              type="text"
              placeholder="Blue Cross, Aetna, etc."
              value={formData.insuranceProvider}
              onChange={handleChange}
            />
            <InputField
              label="Insurance ID Number"
              name="insuranceId"
              type="text"
              placeholder="ABC123456789"
              value={formData.insuranceId}
              onChange={handleChange}
            />
          </FormSection>

          {/* Medical History Section */}
          <FormSection title="Medical History">
            <TextAreaField
              label="Known Allergies"
              name="allergies"
              placeholder="List any allergies to medications, latex, etc."
              value={formData.allergies}
              onChange={handleChange}
              rows={3}
            />
            <TextAreaField
              label="Current Medications"
              name="currentMedications"
              placeholder="List all medications you are currently taking"
              value={formData.currentMedications}
              onChange={handleChange}
              rows={3}
            />
            <TextAreaField
              label="Medical History"
              name="medicalHistory"
              placeholder="Please describe any relevant medical conditions, previous surgeries, or ongoing treatments"
              value={formData.medicalHistory}
              onChange={handleChange}
              rows={4}
            />
          </FormSection>

          {/* Submit Button */}
          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              className="flex-1 bg-dental-blue text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-primary-700 transition-all transform hover:scale-105 shadow-lg"
            >
              Complete Registration
            </button>
            <Link
              href="/"
              className="px-8 py-4 rounded-lg font-semibold text-lg border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-all"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

// Reusable Form Header Component
function FormHeader() {
  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
        Complete Your Patient Profile
      </h1>
      <p className="text-xl text-gray-600">
        Please provide the following information to complete your registration
      </p>
    </div>
  )
}

// Reusable Form Section Component
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900 pb-2 border-b border-gray-200">
        {title}
      </h2>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

// Reusable Input Field Component
function InputField({
  label,
  name,
  type,
  placeholder,
  value,
  onChange,
  required = false
}: {
  label: string
  name: string
  type: string
  placeholder?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        id={name}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dental-blue focus:border-transparent transition-all"
      />
    </div>
  )
}

// Reusable TextArea Field Component
function TextAreaField({
  label,
  name,
  placeholder,
  value,
  onChange,
  rows = 3,
  required = false
}: {
  label: string
  name: string
  placeholder?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  rows?: number
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        id={name}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        rows={rows}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dental-blue focus:border-transparent transition-all resize-none"
      />
    </div>
  )
}
