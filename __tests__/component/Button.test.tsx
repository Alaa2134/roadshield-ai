import { fireEvent, screen } from '@testing-library/react-native';
import { Button } from '@/components/ui/Button';
import { renderWithProviders } from '../utils/render';


describe('Button', () => {
  it('performs its action and is exposed to screen readers', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Submit report" onPress={onPress} accessibilityHint="Sends the report" />);
    const btn = screen.getByRole('button', { name: 'Submit report' });
    await fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled or loading', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Save" onPress={onPress} disabled />);
    const disabled = screen.getByRole('button', { name: 'Save' });
    expect(disabled.props.accessibilityState ?? { disabled: disabled.props['aria-disabled'] }).toMatchObject({ disabled: true });
    await fireEvent.press(disabled);
    await renderWithProviders(<Button label="Saving" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button', { name: 'Saving' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
