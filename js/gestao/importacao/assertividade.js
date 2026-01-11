window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    BATCH_SIZE: 500,
    CONCURRENCY_LIMIT: 3,

    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // 1. Setup Visual
        const btn = input.parentElement;
        const originalHtml = btn.innerHTML;
        const originalClass = btn.className;
        
        const atualizarBotao = (texto, icon = 'fa-circle-notch fa-spin') => {
            btn.innerHTML = `<i class="fas ${icon}"></i> ${texto}`;
            btn.appendChild(input); 
        };

        btn.classList.add('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
        atualizarBotao("Lendo arquivo...");

        try {
            await new Promise(r => setTimeout(r, 50));

            // 2. Dados Auxiliares
            const [resUsers, resEmpresas] = await Promise.all([
                Sistema.supabase.from('usuarios').select('id, nome'),
                Sistema.supabase.from('empresas').select('id, nome, subdominio')
            ]);

            const mapUsuariosID = new Map(resUsers.data?.map(u => [u.id, u.id]));
            const mapUsuariosNome = new Map(resUsers.data?.map(u => [this.normalizar(u.nome), u.id]));
            
            const mapEmpresas = new Map();
            resEmpresas.data?.forEach(e => {
                const info = { id: e.id, nome: e.nome };
                mapEmpresas.set(this.normalizar(e.nome), info);
                if(e.subdominio) mapEmpresas.set(this.normalizar(e.subdominio), info);
            });

            // 3. Processamento
            const linhas = await Gestao.lerArquivo(file);
            atualizarBotao(`Processando ${linhas.length}...`);

            const inserts = [];
            const logErros = new Set();
            let ultimaDataValida = null; // Para usar no filtro depois

            for (const [index, row] of linhas.entries()) {
                const c = {};
                for (const k in row) c[this.normalizarKey(k)] = row[k];

                // Identifica Usuário
                let usuarioId = null;
                let rawId = c['idassistente'] || c['idusuario'] || c['id'];
                if (rawId && mapUsuariosID.has(parseInt(rawId))) {
                    usuarioId = parseInt(rawId);
                } else {
                    let rawNome = c['assistente'] || c['usuario'] || c['nome'];
                    if(rawNome) usuarioId = mapUsuariosNome.get(this.normalizar(rawNome));
                }

                if (!usuarioId) {
                    logErros.add(`Linha ${index+2}: Usuário não identificado (${c['assistente'] || '?'})`);
                    continue;
                }

                // Identifica Empresa
                let empresaId = null;
                let nomeEmpresa = c['empresa'] || '';
                let rawEmpId = c['companyid'] || c['company_id'] || c['idempresa'];
                
                if (rawEmpId) {
                     empresaId = parseInt(rawEmpId);
                } else {
                    const match = mapEmpresas.get(this.normalizar(nomeEmpresa));
                    if(match) {
                        empresaId = match.id;
                        nomeEmpresa = match.nome;
                    }
                }

                // Data
                const rawDate = c['endtime'] || c['datadaauditoria'] || c['data'] || c['date'];
                const dataObj = this.parseDate(rawDate);
                
                if (!dataObj) continue;

                ultimaDataValida = dataObj.data; // Guarda 'YYYY-MM-DD'

                inserts.push({
                    usuario_id: usuarioId,
                    data_referencia: dataObj.data,
                    hora: dataObj.hora,
                    empresa: nomeEmpresa,
                    empresa_id: empresaId,
                    nome_documento: String(c['docname'] || c['documento'] || '').substring(0, 255),
                    status: c['status'] || null,
                    observacao: String(c['apontamentosobs'] || c['obs'] || '').substring(0, 500),
                    num_campos: parseInt(c['ncampos'] || c['numerocampos'] || 0),
                    qtd_ok: parseInt(c['ok'] || 0),
                    nok: parseInt(c['nok'] || 0),
                    assertividade: c['assert'] || c['assertividade'] || null,
                    auditora: c['auditora'] || null,
                    quantidade: 1,
                    fator: 1
                });
            }

            // 4. Envio
            if (inserts.length > 0) {
                const totalLotes = Math.ceil(inserts.length / this.BATCH_SIZE);
                let lotesProcessados = 0;

                const lotes = [];
                for (let i = 0; i < inserts.length; i += this.BATCH_SIZE) {
                    lotes.push(inserts.slice(i, i + this.BATCH_SIZE));
                }

                // Envio Paralelo
                const processar = async (lote) => {
                    const { error } = await Sistema.supabase.from('producao').insert(lote);
                    if (error) throw error;
                    lotesProcessados++;
                    const pct = Math.round((lotesProcessados / totalLotes) * 100);
                    atualizarBotao(`Salvando ${pct}%...`);
                };

                for (let i = 0; i < lotes.length; i += this.CONCURRENCY_LIMIT) {
                    await Promise.all(lotes.slice(i, i + this.CONCURRENCY_LIMIT).map(processar));
                }

                // 5. Sucesso e Auto-Filtro
                this.showToast(`Sucesso! ${inserts.length} registros salvos.`, 'success');
                
                if (logErros.size > 0) {
                    this.baixarLog(logErros);
                    this.showToast(`${logErros.size} erros (ver log).`, 'warning');
                }

                // --- O PULO DO GATO ---
                // Aplica a última data importada no filtro para o usuário ver os dados
                if (ultimaDataValida && Gestao.Assertividade) {
                    const filtroData = document.getElementById('filtro-data');
                    if (filtroData) {
                        filtroData.value = ultimaDataValida;
                        // Simula o evento de change para disparar a busca
                        filtroData.dispatchEvent(new Event('change'));
                        this.showToast(`Filtro atualizado para ${ultimaDataValida.split('-').reverse().join('/')}`, 'info');
                    } else {
                        Gestao.Assertividade.carregar();
                    }
                }

            } else {
                this.showToast("Nenhum registro válido encontrado.", 'error');
            }

        } catch (e) {
            console.error(e);
            this.showToast(`Erro: ${e.message}`, 'error');
        } finally {
            btn.innerHTML = originalHtml;
            btn.className = originalClass;
            input.value = "";
        }
    },

    // Parser Melhorado para anos de 2 e 4 dígitos
    parseDate: function(val) {
        if (!val) return null;
        let dateObj = null;

        // 1. Excel Serial
        if (typeof val === 'number') {
            dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
        } 
        // 2. String
        else if (typeof val === 'string') {
            const clean = val.trim();
            // Formato DD/MM/YY ou DD/MM/YYYY
            const matchBR = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
            if (matchBR) {
                let y = parseInt(matchBR[3]);
                // Ajuste para ano com 2 dígitos (ex: 25 -> 2025)
                if (y < 100) y += 2000; 
                dateObj = new Date(y, parseInt(matchBR[2]) - 1, parseInt(matchBR[1]));
            } else {
                dateObj = new Date(clean);
            }
        } 
        else if (val instanceof Date) {
            dateObj = val;
        }

        if (!dateObj || isNaN(dateObj.getTime())) return null;

        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const h = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');

        return { data: `${y}-${m}-${d}`, hora: `${h}:${min}` };
    },

    normalizar: function(s) { return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ''); },
    normalizarKey: function(k) { return String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, ""); },

    baixarLog: function(setErros) {
        const url = window.URL.createObjectURL(new Blob([Array.from(setErros).join('\n')], {type:'text/plain'}));
        const a = document.createElement('a'); a.href = url; a.download = `erros_${Date.now()}.txt`;
        document.body.appendChild(a); a.click(); a.remove();
    },

    showToast: function(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        if(!container) return alert(msg);
        const el = document.createElement('div');
        const cls = {success:'bg-emerald-600', error:'bg-rose-600', warning:'bg-amber-600', info:'bg-blue-600'};
        el.className = `${cls[type]||cls.info} text-white px-4 py-3 rounded shadow-lg flex items-center gap-3 animate-fade text-sm font-bold min-w-[300px] mb-2`;
        el.innerHTML = `<i class="fas ${type==='success'?'fa-check':type==='error'?'fa-times':'fa-info-circle'}"></i><span>${msg}</span>`;
        container.appendChild(el);
        setTimeout(()=>el.remove(), 4000);
    }
};