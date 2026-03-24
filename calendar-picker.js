// calendar-picker.js - Custom Calendar Picker Component

class CalendarPicker {
    constructor(inputElement, onDateSelect) {
        this.input = inputElement;
        this.onDateSelect = onDateSelect;
        this.currentDate = new Date();
        this.selectedDate = null;

        // Create a unique popup for this picker instance
        this.createPopupElement();
        this.isOpen = false;

        this.monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        this.init();
    }

    createPopupElement() {
        // Create a unique popup for this calendar instance
        this.popup = document.createElement('div');
        this.popup.className = 'calendar-popup';
        this.popup.style.display = 'none';
        this.popup.innerHTML = `
            <div class="calendar-header">
                <button class="calendar-nav-btn calendar-prev-month">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
                <div class="calendar-month-year"></div>
                <button class="calendar-nav-btn calendar-next-month">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            </div>
            <div class="calendar-weekdays">
                <div class="calendar-weekday">Mo</div>
                <div class="calendar-weekday">Tu</div>
                <div class="calendar-weekday">We</div>
                <div class="calendar-weekday">Th</div>
                <div class="calendar-weekday">Fr</div>
                <div class="calendar-weekday">Sa</div>
                <div class="calendar-weekday">Su</div>
            </div>
            <div class="calendar-days"></div>
            <div class="calendar-footer">
                <button class="calendar-btn-clear">Clear</button>
                <button class="calendar-btn-today">Today</button>
            </div>
        `;
        document.body.appendChild(this.popup);
    }

    init() {
        // Click on input to open calendar
        this.input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Navigation buttons
        this.popup.querySelector('.calendar-prev-month').addEventListener('click', () => {
            this.previousMonth();
        });

        this.popup.querySelector('.calendar-next-month').addEventListener('click', () => {
            this.nextMonth();
        });

        // Footer buttons
        this.popup.querySelector('.calendar-btn-today').addEventListener('click', () => {
            this.selectToday();
        });

        this.popup.querySelector('.calendar-btn-clear').addEventListener('click', () => {
            this.clear();
        });

        // Close calendar when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.popup.contains(e.target) && e.target !== this.input) {
                this.close();
            }
        });
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        // Position calendar popup near the input
        const rect = this.input.getBoundingClientRect();
        this.popup.style.top = (rect.bottom + 8) + 'px';
        this.popup.style.left = rect.left + 'px';

        this.popup.style.display = 'block';
        this.isOpen = true;
        this.render();
    }

    close() {
        this.popup.style.display = 'none';
        this.isOpen = false;
    }

    previousMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.render();
    }

    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.render();
    }

    selectToday() {
        const today = new Date();
        this.selectDate(today);
    }

    clear() {
        this.selectedDate = null;
        this.input.value = '';
        this.close();
        if (this.onDateSelect) {
            this.onDateSelect(null);
        }
    }

    selectDate(date) {
        this.selectedDate = new Date(date);
        this.input.value = this.formatDate(date);
        this.close();
        if (this.onDateSelect) {
            this.onDateSelect(this.formatDateISO(date));
        }
    }

    formatDate(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}. ${month}. ${year}`;
    }

    formatDateISO(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${year}-${month}-${day}`;
    }

    render() {
        // Update month/year header
        const monthYearEl = this.popup.querySelector('.calendar-month-year');
        monthYearEl.textContent = `${this.monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;

        // Render days
        this.renderDays();
    }

    renderDays() {
        const daysContainer = this.popup.querySelector('.calendar-days');
        daysContainer.innerHTML = '';

        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        // First day of the month
        const firstDay = new Date(year, month, 1);
        // Last day of the month
        const lastDay = new Date(year, month + 1, 0);

        // Get day of week (0 = Sunday, we want Monday = 0)
        let startDayOfWeek = firstDay.getDay();
        startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Convert to Monday = 0

        // Days from previous month
        const prevMonthLastDay = new Date(year, month, 0);
        const prevMonthDays = prevMonthLastDay.getDate();

        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthDays - i;
            const date = new Date(year, month - 1, day);
            this.createDayElement(day, date, true, daysContainer);
        }

        // Days of current month
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month, day);
            this.createDayElement(day, date, false, daysContainer);
        }

        // Days from next month to fill the grid
        const totalCells = daysContainer.children.length;
        const remainingCells = 7 - (totalCells % 7);
        if (remainingCells < 7) {
            for (let day = 1; day <= remainingCells; day++) {
                const date = new Date(year, month + 1, day);
                this.createDayElement(day, date, true, daysContainer);
            }
        }
    }

    createDayElement(dayNumber, date, isOtherMonth, daysContainer) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.textContent = dayNumber;

        if (isOtherMonth) {
            dayEl.classList.add('other-month');
        }

        // Check if today
        const today = new Date();
        if (this.isSameDay(date, today)) {
            dayEl.classList.add('today');
        }

        // Check if selected
        if (this.selectedDate && this.isSameDay(date, this.selectedDate)) {
            dayEl.classList.add('selected');
        }

        // Click event
        dayEl.addEventListener('click', () => {
            this.selectDate(date);
        });

        daysContainer.appendChild(dayEl);
    }

    isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    // Set value programmatically
    setValue(dateString) {
        if (!dateString) {
            this.clear();
            return;
        }

        // Parse YYYY-MM-DD format
        const parts = dateString.split('-');
        if (parts.length === 3) {
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);
            const date = new Date(year, month, day);

            this.selectedDate = date;
            this.currentDate = new Date(date);
            this.input.value = this.formatDate(date);
        }
    }
}
