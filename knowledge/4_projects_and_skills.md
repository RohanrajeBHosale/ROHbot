### Key Projects

**1. Interactive Resume with Conversational AI Assistant (ROHbot):**
This project is a demonstration of my skills. I engineered this voice-enabled conversational AI assistant for my personal portfolio. It initially used the Web Speech API and a JavaScript-based NLU engine. I have since upgraded it to a full-stack RAG system with a Gemini/OpenAI-powered LLM, my own cloned voice via ElevenLabs, and a robust backend on Vercel.
- **Technologies:** Gemini/OpenAI, Supabase Vector, Node.js, Vercel, ElevenLabs
- **Signals:** Grounding + citations, Deployable, System design
- **Metrics:** Deployed system: ingest → index → retrieve → respond
- **Live Demo:** [https://www.rohanraje.com/](https://www.rohanraje.com/)
- **GitHub:** [https://github.com/RohanrajeBHosale/rohbot](https://github.com/RohanrajeBHosale/rohbot)

**2. Agentic AI for Customer Support:**
I built a production-ready conversational AI system using Retrieval-Augmented Generation (RAG) and foundation models like GPT-4. The system was designed to automate 85% of Tier-1 customer queries. I engineered custom routing logic and fine-tuned prompts to ground the model's outputs, which successfully cut resolution time and reduced human escalation rates by 40%. A key feature was a continuous learning data pipeline to capture user feedback for automated retraining.

**3. Agentic AI-Driven Market Intelligence:**
I designed a scalable agent framework using LangGraph and LangChain, leveraging Apache Spark and cloud services to process and analyze over 10,000 documents daily from more than 200 real-time data sources. This system employed RAG pipelines to ground LLM outputs (GPT-4, Claude 3) with real-time external data, achieving 92% accuracy in forecasting market shifts 3-5 weeks in advance. The insights were delivered through an interactive dashboard connected to a 15TB+ Google BigQuery warehouse.

**4. AI Used Car Price Estimator:**
Production-grade XGBoost regressor deployed via Streamlit to predict vehicle market values with 82% accuracy.
- **Technologies:** XGBoost, Streamlit, Python, Scikit-Learn
- **Signals:** End-to-End ML, Deployment, Business Value
- **Metrics:** R² Score: 0.82, Trained on 300k+ real listings
- **GitHub:** [https://github.com/RohanrajeBHosale/ai-used-car-price-estimator](https://github.com/RohanrajeBHosale/ai-used-car-price-estimator)

**5. Sketch Studio — Sketch → Photorealistic Portraits:**
Stable Diffusion + ControlNet pipeline to preserve sketch structure while generating photorealistic portraits.
- **Technologies:** Stable Diffusion, ControlNet, BLIP, PyTorch
- **Signals:** Conditioned generation, Prompt adherence, Evaluation-ready
- **Metrics:** Qualitative evaluation grid for SSIM/CLIP adherence.
- **GitHub:** [https://github.com/RohanrajeBHosale/sketch-studio](https://github.com/RohanrajeBHosale/sketch-studio)

**6. Automated Data Quality Control Panel:**
ETL validation pipeline detecting schema violations and statistical outliers in financial data.
- **Technologies:** Python, SQL, Streamlit, Pandas
- **Signals:** Data Integrity, Automated Testing, Visualization
- **Metrics:** Reduced manual review by ~40% (simulated)
- **GitHub:** [https://github.com/RohanrajeBHosale/Automated-Data-Quality-Control-Panel](https://github.com/RohanrajeBHosale/Automated-Data-Quality-Control-Panel)

**7. Fake News Detection Engine (NLP):**
Fine-tuned transformer model with a simple inference layer and evaluation workflow.
- **Technologies:** RoBERTa, Hugging Face, Python
- **Signals:** Fine-tuning, Eval, Serving
- **Metrics:** F1 Score: [Add actual F1 score], Dataset Size: [Add actual dataset size] (e.g., "Trained on 100k articles")
- **GitHub:** [https://github.com/RohanrajeBHosale/Fake-News-Detection-Engine-NLP](https://github.com/RohanrajeBHosale/Fake-News-Detection-Engine-NLP)

**8. Data Pipeline — ETL to Analytics Outputs:**
ETL pipeline design focusing on clean transforms, reliability, and query-ready outputs.
- **Technologies:** Python, SQL, Spark/BigQuery
- **Signals:** ETL, Scalable, Production mindset
- **Metrics:** Average runtime: [Add runtime], Scheduling: [Add schedule], Data volume: [Add data volume] (e.g., "Processed 1TB daily")
- **GitHub:** [https://github.com/RohanrajeBHosale/Data-Pipeline-ETL-to-Analytics-Outputs](https://github.com/RohanrajeBHosale/Data-Pipeline-ETL-to-Analytics-Outputs)

**9. ML Framework for Skin Disease Detection:**
I developed a complete end-to-end ML pipeline in R for early skin cancer detection. This project demonstrated my proficiency across the entire model lifecycle, from preprocessing to performance evaluation. The framework was modularized using the `caret` and `mlr` packages to enable plug-and-play integration of new classifiers, which improved diagnostic precision by 22%.

### Technical Skills

- **Languages:** Python, SQL, R, MATLAB, JavaScript
- **ML Frameworks:** PyTorch, TensorFlow, Scikit-learn, Hugging Face, LangChain, LangGraph, CrewAI
- **Large-Scale Data:** Apache Spark, AWS (S3, Glue, Lambda, Athena, Redshift), Azure, GCP
- **Foundation Models:** OpenAI API (GPT-4), Claude, RAG, FAISS, Pinecone, Prompt Engineering
- **Databases & Querying:** PostgreSQL, MySQL, MS SQL Server, MongoDB, Snowflake, Redshift

### Publications

I have one publication titled "Bibliometric Analysis of Machine Learning and Text Mining Algorithms for Diagnosis of Leukemia," which is available for review on my LinkedIn profile.

---

**Important Notes for `4_projects_and_skills.md`:**
*   I've filled in some placeholder GitHub links for your projects based on common naming conventions on your profile. **Please verify these links in the markdown file are correct** or update them to the actual URLs.
*   For "Sketch Studio," "Fake News Detection Engine," and "Data Pipeline," I've added placeholders for metrics. **Fill in the actual metrics** if you have them, as specific numbers greatly improve the chatbot's answers.
*   I've included the existing detailed descriptions for projects like "Agentic AI for Customer Support" and "Agentic AI-Driven Market Intelligence" as they provide good context.

### Step 2: Ensure GitHub Repositories are Tagged (for auto-ingestion)

Your `ingest.js` script attempts to auto-discover projects from GitHub if they have the `portfolio` topic.

**Action:** Go to your GitHub profile and ensure any new or relevant project repositories you want ROHbot to know about have the **`portfolio` topic** added in their repository settings.

### Step 3: Run the Ingestion Script

Now that your local knowledge files are updated, run the script to push these changes to Supabase.



