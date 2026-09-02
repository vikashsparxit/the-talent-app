// Indian Locale Utilities for SparxIT Assessment System

import { enIN } from 'date-fns/locale';

// Re-export Indian English locale for date-fns
export const indianLocale = enIN;

/**
 * Format a number in Indian numbering system (lakhs, crores)
 * e.g., 1000000 -> "10,00,000"
 */
export function formatIndianNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '';
  return num.toLocaleString('en-IN');
}

/**
 * Format currency in INR with Indian numbering
 * e.g., 500000 -> "₹5,00,000"
 */
export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '';
  return `₹${formatIndianNumber(amount)}`;
}

/**
 * Format salary range in INR
 */
export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  const symbol = '₹';
  
  if (min && max) {
    return `${symbol}${formatIndianNumber(min)} - ${symbol}${formatIndianNumber(max)}`;
  } else if (min) {
    return `${symbol}${formatIndianNumber(min)}+`;
  } else if (max) {
    return `Up to ${symbol}${formatIndianNumber(max)}`;
  }
  return '';
}

/**
 * Default currency for the platform
 */
export const DEFAULT_CURRENCY = 'INR';

/**
 * Indian phone number placeholder
 */
export const PHONE_PLACEHOLDER = '+91 98765 43210';

/**
 * Common Indian cities for location suggestions
 */
export const INDIAN_LOCATIONS = [
  'Ahmedabad',
  'Bangalore',
  'Chennai',
  'Delhi NCR',
  'Gurgaon',
  'Hyderabad',
  'Kolkata',
  'Mumbai',
  'Noida',
  'Pune',
  'Remote (India)',
];

/**
 * Salary placeholders in INR (in lakhs format)
 * Common salary ranges for IT industry in India
 */
export const SALARY_PLACEHOLDERS = {
  min: '400000', // 4 LPA
  max: '1200000', // 12 LPA
};
