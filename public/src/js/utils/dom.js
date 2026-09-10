// DOM manipulation utilities

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

function createElement(tag, className = '', innerHTML = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (innerHTML) element.innerHTML = innerHTML;
  return element;
}

function showElement(element) {
  element.classList.remove('hidden');
}

function hideElement(element) {
  element.classList.add('hidden');
}

function toggleElement(element) {
  element.classList.toggle('hidden');
}

function removeElement(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

function addClass(element, className) {
  element.classList.add(className);
}

function removeClass(element, className) {
  element.classList.remove(className);
}

function hasClass(element, className) {
  return element.classList.contains(className);
}

function setAttribute(element, name, value) {
  element.setAttribute(name, value);
}

function getAttribute(element, name) {
  return element.getAttribute(name);
}

function setData(element, key, value) {
  element.dataset[key] = value;
}

function getData(element, key) {
  return element.dataset[key];
}

function on(element, event, handler) {
  element.addEventListener(event, handler);
}

function off(element, event, handler) {
  element.removeEventListener(event, handler);
}

function html(element, content) {
  element.innerHTML = content;
}

function text(element, content) {
  element.textContent = content;
}

function append(parent, child) {
  parent.appendChild(child);
}

function prepend(parent, child) {
  parent.insertBefore(child, parent.firstChild);
}

function empty(element) {
  element.innerHTML = '';
}

function insertAfter(reference, newElement) {
  reference.parentNode.insertBefore(newElement, reference.nextSibling);
}

function insertBefore(reference, newElement) {
  reference.parentNode.insertBefore(newElement, reference);
}

function replaceElement(oldElement, newElement) {
  oldElement.parentNode.replaceChild(newElement, oldElement);
}

function focus(element) {
  element.focus();
}

function blur(element) {
  element.blur();
}

function disable(element) {
  element.disabled = true;
}

function enable(element) {
  element.disabled = false;
}

function isDisabled(element) {
  return element.disabled;
}

function scrollTo(element, options = {}) {
  element.scrollIntoView({ behavior: 'smooth', ...options });
}

function getOffset(element) {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.pageYOffset,
    left: rect.left + window.pageXOffset
  };
}

function getPosition(element) {
  return {
    left: element.offsetLeft,
    top: element.offsetTop
  };
}

function getWidth(element) {
  return element.offsetWidth;
}

function getHeight(element) {
  return element.offsetHeight;
}

function setValue(element, value) {
  element.value = value;
}

function getValue(element) {
  return element.value;
}

function check(element) {
  element.checked = true;
}

function uncheck(element) {
  element.checked = false;
}

function isChecked(element) {
  return element.checked;
}