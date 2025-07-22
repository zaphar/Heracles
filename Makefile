test-headless:
	/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless --disable-gpu \
		--enable-features=ConversionMeasurement,AttributionReportingCrossAppWeb \
		--dump-dom http://localhost:8000/tests/TapHarness.html
