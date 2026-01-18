import './SpeakingIndicator.css';

/**
 * Speaking Indicator - shows green ring when user is speaking
 */
const SpeakingIndicator = ({ isSpeaking, children }) => {
  return (
    <div className={`speaking-indicator-wrapper ${isSpeaking ? 'is-speaking' : ''}`}>
      {children}
    </div>
  );
};

export default SpeakingIndicator;
