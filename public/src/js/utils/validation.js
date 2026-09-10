// Form validation utilities

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validateRequired(value) {
  return value !== null && value !== undefined && value.toString().trim() !== '';
}

function validateMinLength(value, min) {
  return value && value.length >= min;
}

function validateMaxLength(value, max) {
  return !value || value.length <= max;
}

function validateNumeric(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

function validateRange(value, min, max) {
  const num = parseFloat(value);
  return !isNaN(num) && num >= min && num <= max;
}

function validateDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

// Form validation
function validateForm(formElement) {
  const errors = [];
  const inputs = formElement.querySelectorAll('input[required], textarea[required], select[required]');
  
  inputs.forEach(input => {
    if (!validateRequired(input.value)) {
      errors.push(`${input.previousElementSibling?.textContent || 'Field'} is required`);
      input.classList.add('error');
    } else {
      input.classList.remove('error');
    }
    
    // Email validation
    if (input.type === 'email' && input.value && !validateEmail(input.value)) {
      errors.push('Please enter a valid email address');
      input.classList.add('error');
    }
    
    // Numeric validation
    if (input.type === 'number' && input.value && !validateNumeric(input.value)) {
      errors.push('Please enter a valid number');
      input.classList.add('error');
    }
  });
  
  return errors;
}

// Clear validation errors
function clearValidationErrors(formElement) {
  const inputs = formElement.querySelectorAll('input, textarea, select');
  inputs.forEach(input => input.classList.remove('error'));
}