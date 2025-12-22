import { describe, it, expect, vi } from 'vitest';
import { exportToCSV, exportToJSON } from '../export-utils';

describe('Export Utils', () => {
  describe('exportToCSV', () => {
    it('exports data to CSV format', () => {
      const data = [
        { name: 'John', age: 30, city: 'New York' },
        { name: 'Jane', age: 25, city: 'London' },
      ];

      const createObjectURL = vi.fn();
      const revokeObjectURL = vi.fn();
      global.URL.createObjectURL = createObjectURL;
      global.URL.revokeObjectURL = revokeObjectURL;

      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);

      exportToCSV(data, 'test-export');

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.download).toBe('test-export.csv');
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('handles empty data array', () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);

      exportToCSV([], 'empty-export');

      // Should not call click for empty array
      expect(mockLink.click).not.toHaveBeenCalled();
    });
  });

  describe('exportToJSON', () => {
    it('exports single object to JSON format', () => {
      const data = { name: 'Test', value: 123 };

      const createObjectURL = vi.fn();
      const revokeObjectURL = vi.fn();
      global.URL.createObjectURL = createObjectURL;
      global.URL.revokeObjectURL = revokeObjectURL;

      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);

      exportToJSON([data], 'test-export');

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.download).toBe('test-export.json');
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('properly formats JSON with indentation', () => {
      const data = [{ nested: { value: 'test' } }];
      
      const blobSpy = vi.spyOn(global, 'Blob');
      
      exportToJSON(data, 'formatted');

      expect(blobSpy).toHaveBeenCalledWith(
        [JSON.stringify(data, null, 2)],
        { type: 'application/json' }
      );
    });
  });
});
