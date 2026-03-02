import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchableLocationInput from './SearchableLocationInput';
import { describe, it, expect, vi } from 'vitest';

const mockLocations = [
    { id: '1', name: 'Phoenix', lat: 33.4, lon: -112.0 },
    { id: '2', name: 'Scottsdale', lat: 33.5, lon: -111.9 },
    { id: '3', name: 'Tempe', lat: 33.4, lon: -111.9 },
];

describe('SearchableLocationInput', () => {
    it('renders with label and placeholder', () => {
        render(
            <SearchableLocationInput
                label="Start"
                value={null}
                locations={mockLocations}
                onChange={() => { }}
                icon="start"
                placeholder="Search..."
            />
        );

        expect(screen.getByText('Start')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('shows filtered results when typing', async () => {
        const user = userEvent.setup();
        render(
            <SearchableLocationInput
                label="Start"
                value={null}
                locations={mockLocations}
                onChange={() => { }}
                icon="start"
            />
        );

        const input = screen.getByRole('textbox');
        await user.type(input, 'ph');

        expect(screen.getByText((_, node) => node?.tagName.toLowerCase() === 'span' && node?.textContent === 'Phoenix')).toBeInTheDocument();
        expect(screen.queryByText((_, node) => node?.tagName.toLowerCase() === 'span' && node?.textContent === 'Scottsdale')).not.toBeInTheDocument();
    });

    it('calls onChange when a location is selected', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <SearchableLocationInput
                label="Start"
                value={null}
                locations={mockLocations}
                onChange={onChange}
                icon="start"
            />
        );

        const input = screen.getByRole('textbox');
        await user.click(input);

        const option = screen.getByText('Scottsdale');
        await user.click(option);

        expect(onChange).toHaveBeenCalledWith(mockLocations[1]);
    });

    it('clears selection when clear button is clicked', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <SearchableLocationInput
                label="Start"
                value={mockLocations[0]}
                locations={mockLocations}
                onChange={onChange}
                icon="start"
            />
        );

        const clearBtn = screen.getByTitle('Clear');
        await user.click(clearBtn);

        expect(onChange).toHaveBeenCalledWith(null);
    });

    it('navigates with keyboard', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <SearchableLocationInput
                label="Start"
                value={null}
                locations={mockLocations}
                onChange={onChange}
                icon="start"
            />
        );

        const input = screen.getByRole('textbox');
        await user.click(input);

        // click opens it (highlightIndex 0), ArrowDown moves to index 1
        await user.keyboard('{ArrowDown}');
        await user.keyboard('{Enter}');

        expect(onChange).toHaveBeenCalledWith(mockLocations[1]);
    });

    it('highlights the matched text', async () => {
        const user = userEvent.setup();
        const { container } = render(
            <SearchableLocationInput
                label="Start"
                value={null}
                locations={mockLocations}
                onChange={() => { }}
                icon="start"
            />
        );

        const input = screen.getByRole('textbox');
        await user.type(input, 'ph');

        const highlight = container.querySelector('.search-highlight');
        expect(highlight).toBeInTheDocument();
        expect(highlight?.textContent).toBe('Ph');
    });
});
